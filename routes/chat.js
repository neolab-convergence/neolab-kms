const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth, isAdminEmail } = require('../lib/auth');
const { getCached } = require('../lib/sheets');

// 기본 모델: env로 덮어쓰기 가능. OpenRouter 무료 모델 중 컨텍스트 넓고 안정적인 것 선택.
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-3-flash-preview';

// ─── 사용자별 Rate Limit (10초 5회) ───
const rateMap = new Map();
function checkRate(key) {
    const now = Date.now();
    const win = 10_000, limit = 5;
    const arr = (rateMap.get(key) || []).filter(t => now - t < win);
    if (arr.length >= limit) return false;
    arr.push(now);
    rateMap.set(key, arr);
    return true;
}
// 주기적 정리 (메모리 누수 방지)
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateMap) {
        const f = v.filter(t => now - t < 60_000);
        if (f.length === 0) rateMap.delete(k); else rateMap.set(k, f);
    }
}, 60_000).unref();

// ─── 한글/영문 유의어 사전 (키워드 확장) ───
const SYN = [
    ['연락처', '전화', '전화번호', '번호', '핸드폰', '휴대폰', '연락'],
    ['이메일', '메일', 'email', 'mail'],
    ['규정', '규칙', '정책', '내규', '제도', '지침'],
    ['가이드', '매뉴얼', '안내', '방법', '어떻게', '절차', '프로세스'],
    ['택배', '배송', '우편', '발송'],
    ['출장', '출장비', '여비'],
    ['휴가', '연차', '월차', '반차'],
    ['대표', '대표이사', 'ceo'],
    ['제품', '프로덕트', 'product'],
    ['공지', '알림', '안내사항'],
    ['조직', '조직도', '부서', '팀'],
];
function expandKeywords(q) {
    const base = q.toLowerCase().split(/[\s,./?!()[\]{}"'·;:\-]+/).filter(w => w.length >= 1);
    const set = new Set(base);
    base.forEach(w => {
        SYN.forEach(group => { if (group.includes(w)) group.forEach(g => set.add(g)); });
    });
    return Array.from(set).filter(w => w.length >= 1);
}

// ─── 게시물 점수 매기기 (TF-like, 제목/부가정보 가중치 높음) ───
function scorePost(post, keywords) {
    const title = (post.title || '').toLowerCase();
    const sub = (post.subInfo || '').toLowerCase();
    const content = (post.content || '').toLowerCase();
    const ocr = (post.ocrText || '').toLowerCase();
    let score = 0;
    keywords.forEach(k => {
        if (!k) return;
        if (title.includes(k)) score += 10;
        if (sub.includes(k)) score += 5;
        if (content.includes(k)) score += 2;
        if (ocr.includes(k)) score += 2;
    });
    return score;
}

// ─── history 검증 ───
function sanitizeHistory(h) {
    if (!Array.isArray(h)) return [];
    return h
        .filter(m => m && typeof m === 'object' && typeof m.content === 'string' && m.content.length < 4000)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-6)
        .map(m => ({ role: m.role, content: m.content }));
}

router.post('/api/chat', requireAuth, async (req, res) => {
    const API_KEY = process.env.OPENROUTER_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'AI 챗봇이 설정되지 않았습니다. (OPENROUTER_API_KEY 미설정)' });

    const { message, history, stream } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: '질문을 입력해주세요.' });
    }
    if (message.length > 2000) {
        return res.status(400).json({ error: '질문이 너무 깁니다 (최대 2000자).' });
    }

    // Rate limit
    if (!checkRate(req.user.email || 'anon')) {
        return res.status(429).json({ error: '잠시 후 다시 시도해주세요 (10초에 5회 제한).' });
    }

    try {
        // 캐시 사용 (매 요청마다 Google Sheets 직접 호출 방지)
        const [posts, boards, categories, notices, contacts] = await Promise.all([
            getCached('posts'),
            getCached('boards'),
            getCached('categories'),
            getCached('notices'),
            getCached('contacts'),
        ]);

        const boardMap = {}; boards.forEach(b => { boardMap[b.id] = b.name; });
        const catMap = {}; categories.forEach(c => { catMap[c.id] = c.name; });

        // 관리자만 전체 인사정보 접근 가능
        const isAdmin = await isAdminEmail(req.user.email);

        // 키워드 기반 1차 필터링 → 상위 N개 선택 (RAG lite)
        const keywords = expandKeywords(message);
        const scored = posts
            .map(p => ({ post: p, score: scorePost(p, keywords) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 15);

        // 점수 0인 경우 최근 게시물 상위 10개라도 참고 컨텍스트로 사용
        let topPosts = scored.map(x => x.post);
        if (topPosts.length === 0) {
            topPosts = posts.slice(-10);
        }

        let context = '=== 관련 문서 (키워드 매칭 상위) ===\n';
        topPosts.forEach(p => {
            let doc = (p.content || '').substring(0, 600);
            if (p.ocrText) doc += '\n[OCR] ' + p.ocrText.substring(0, 400);
            context += `[DOC:${p.id}] 제목: ${p.title} | 게시판: ${boardMap[p.boardId] || ''} | 카테고리: ${catMap[p.categoryId] || ''} | 유형: ${p.type || 'text'} | 부가정보: ${p.subInfo || ''}\n내용: ${doc}\n\n`;
        });

        if (notices.length > 0) {
            context += '=== 공지사항 ===\n';
            notices.slice(0, 10).forEach(n => {
                context += `- ${n.title}: ${(n.content || '').substring(0, 200)}\n`;
            });
            context += '\n';
        }

        if (contacts.length > 0) {
            context += '=== 인사정보 ===\n';
            if (isAdmin) {
                // 관리자: 전체 필드
                contacts.forEach(c => {
                    context += `${c.name} | 직급:${c.position || ''} | 부서:${c.dept || ''} | 전화:${c.phone || ''} | 이메일:${c.email || ''}\n`;
                });
            } else {
                // 일반 사용자: 질문에 이름/부서/직급이 매칭될 때만, 민감 필드 일부 마스킹
                const hit = contacts.filter(c => {
                    const name = (c.name || '').toLowerCase();
                    const dept = (c.dept || '').toLowerCase();
                    const pos = (c.position || '').toLowerCase();
                    return keywords.some(k => k && (name.includes(k) || dept.includes(k) || pos.includes(k)));
                }).slice(0, 20);
                if (hit.length > 0) {
                    hit.forEach(c => {
                        context += `${c.name} | 직급:${c.position || ''} | 부서:${c.dept || ''} | 전화:${c.phone || ''} | 이메일:${c.email || ''}\n`;
                    });
                } else {
                    context += '(해당 질문에 매칭되는 인사정보 없음. 전체 명단은 관리자만 조회 가능.)\n';
                }
            }
            context += '\n';
        }

        const systemPrompt = `당신은 NeoLab 사내 지식관리시스템(KMS)의 AI 도우미 "네오봇"입니다.

## 핵심 규칙
1. 아래 제공된 문서 데이터를 기반으로만 답변하세요. 추측하지 마세요.
2. 답변에 참고한 문서는 반드시 [DOC:문서ID] 형태로 본문 안에 포함하세요. 예: "출장비 정산은... [DOC:3]"
3. 제공된 데이터에 없는 내용은 "등록된 문서에서 해당 정보를 찾을 수 없습니다"라고 답변하세요.
4. 한국어로 친절하고 간결하게, 마크다운 형식(굵게, 목록, 표)을 적극 사용하세요.

## 질문 이해
- 유의어/줄임말/비격식 표현을 폭넓게 인식하세요.
- 사람 찾기는 인사정보에서, 절차/규정은 문서에서 검색하세요.

## 답변 스타일
- **결론 먼저**, 그다음 근거와 문서 참조.
- 인사정보 답변은 표 형식(| 이름 | 직급 | 부서 | 연락처 |)으로.
- 절차/방법은 번호 목록으로.

${context}`;

        const chatMessages = sanitizeHistory(history);

        const requestBody = {
            model: DEFAULT_MODEL,
            messages: [
                { role: 'system', content: systemPrompt },
                ...chatMessages,
                { role: 'user', content: message }
            ],
            temperature: 0.3,
            max_tokens: 1024,
            stream: !!stream,
        };

        const fetch = (await import('node-fetch')).default;
        const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
                'HTTP-Referer': 'https://kms.neolab.net',
                'X-Title': 'NeoLab KMS',
            },
            body: JSON.stringify(requestBody),
        });

        if (!upstream.ok) {
            const errText = await upstream.text().catch(() => '');
            writeLog('ERROR', `AI API ${upstream.status}`, errText.substring(0, 300));
            return res.status(502).json({
                error: `AI 응답 실패 (${upstream.status}). 관리자에게 문의하거나 잠시 후 재시도해주세요.`,
                detail: errText.substring(0, 200),
            });
        }

        // ─── 스트리밍 모드: SSE passthrough + 참조문서는 끝에 meta 이벤트로 전달 ───
        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders?.();

            let fullAnswer = '';
            let buf = '';
            upstream.body.on('data', chunk => {
                buf += chunk.toString('utf8');
                // OpenRouter SSE: 각 이벤트는 \n\n 로 구분
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const part of parts) {
                    const line = part.split('\n').find(l => l.startsWith('data:'));
                    if (!line) continue;
                    const payload = line.slice(5).trim();
                    if (payload === '[DONE]') continue;
                    try {
                        const j = JSON.parse(payload);
                        const delta = j.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullAnswer += delta;
                            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
                        }
                    } catch (e) { /* ignore */ }
                }
            });
            upstream.body.on('end', () => {
                const refs = extractRefs(fullAnswer, posts);
                const clean = fullAnswer.replace(/\[DOC:[^\]]+\]/g, '').trim();
                res.write(`data: ${JSON.stringify({ done: true, references: refs, fullAnswer: clean })}\n\n`);
                res.end();
                writeLog('CHAT', `스트림질문: ${message.substring(0, 50)}`, `user=${req.user.email}, len=${fullAnswer.length}, refs=${refs.length}`);
            });
            upstream.body.on('error', err => {
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            });
            return;
        }

        // ─── 일반(비스트리밍) 모드 ───
        const data = await upstream.json();
        if (data.error) {
            writeLog('ERROR', 'AI API 오류', JSON.stringify(data.error).substring(0, 300));
            return res.status(502).json({ error: data.error?.message || 'AI 응답 생성에 실패했습니다.' });
        }

        const answer = data.choices?.[0]?.message?.content || 'AI 응답을 생성할 수 없습니다.';
        const references = extractRefs(answer, posts);
        const cleanAnswer = answer.replace(/\[DOC:[^\]]+\]/g, '').trim();

        const tokenInfo = data.usage ? `tokens=${data.usage.total_tokens || 0}` : '';
        writeLog('CHAT', `질문: ${message.substring(0, 50)}`, `user=${req.user.email}, ${tokenInfo}, refs=${references.length}`);

        res.json({ answer: cleanAnswer, references });

    } catch (err) {
        writeLog('ERROR', '챗봇 오류', (err && err.message) || String(err));
        res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.', detail: err.message });
    }
});

// 답변 본문에서 [DOC:id] 추출 → 게시물 메타로 변환
function extractRefs(answer, posts) {
    const refs = [];
    const seen = new Set();
    const re = /\[DOC:([^\]]+)\]/g;
    let m;
    while ((m = re.exec(answer)) !== null) {
        const id = m[1].trim();
        if (seen.has(id)) continue;
        seen.add(id);
        const post = posts.find(p => String(p.id) === id);
        if (post) refs.push({ id: post.id, title: post.title, boardId: post.boardId });
    }
    return refs;
}

module.exports = router;

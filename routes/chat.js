const express = require('express');
const router = express.Router();
const { writeLog } = require('../lib/logger');
const { requireAuth } = require('../lib/auth');
const { getSheetData } = require('../lib/sheets');

router.post('/api/chat', requireAuth, async (req, res) => {
    const API_KEY = process.env.OPENROUTER_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'AI 챗봇이 설정되지 않았습니다.' });

    const { message, history } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: '질문을 입력해주세요.' });

    try {
        const posts = await getSheetData('posts');
        const boards = await getSheetData('boards');
        const categories = await getSheetData('categories');
        const notices = await getSheetData('notices');
        const contacts = await getSheetData('contacts');

        const boardMap = {};
        boards.forEach(b => { boardMap[b.id] = b.name; });
        const catMap = {};
        categories.forEach(c => { catMap[c.id] = c.name; });

        let context = '=== 등록된 문서 목록 ===\n';
        posts.forEach(p => {
            let docContent = (p.content || '').substring(0, 500);
            // OCR 추출 텍스트가 있으면 추가 (이미지 게시물 검색 가능)
            if (p.ocrText) docContent += '\n[이미지OCR] ' + p.ocrText.substring(0, 500);
            context += `[문서 ID:${p.id}] 제목: ${p.title} | 게시판: ${boardMap[p.boardId] || p.boardId} | 카테고리: ${catMap[p.categoryId] || p.categoryId} | 유형: ${p.type || 'text'} | 부가정보: ${p.subInfo || ''} | 내용: ${docContent}\n`;
        });

        if (notices.length > 0) {
            context += '\n=== 공지사항 ===\n';
            notices.forEach(n => {
                context += `[공지] ${n.title}: ${(n.content || '').substring(0, 300)}\n`;
            });
        }

        if (contacts.length > 0) {
            context += '\n=== 인사정보 ===\n';
            contacts.forEach(c => {
                context += `${c.name} | 직급: ${c.position || ''} | 부서: ${c.dept || ''} | 전화: ${c.phone || ''} | 이메일: ${c.email || ''}\n`;
            });
        }

        const chatMessages = (history || []).slice(-6).map(h => ({
            role: h.role === 'user' ? 'user' : 'assistant',
            content: h.content
        }));

        const systemPrompt = `당신은 NeoLab 사내 지식관리시스템(KMS)의 AI 도우미 "네오봇"입니다.

## 핵심 규칙
1. 아래 제공된 문서 데이터를 기반으로 질문에 답변하세요.
2. 답변 시 관련 문서가 있으면 반드시 [DOC:문서ID] 형태로 포함해주세요. 예: [DOC:3]
3. 등록된 문서에 없는 내용은 "등록된 문서에서 해당 정보를 찾을 수 없습니다"라고 답변하세요.
4. 한국어로 친절하고 간결하게 답변하세요.

## 질문 이해 규칙 (중요!)
사용자는 다양한 방식으로 같은 것을 물어봅니다. 아래 패턴들을 인식해야 합니다:
- 유의어/줄임말: "연락처"="전화번호"="번호"="핸드폰", "택배"="배송"="우편", "규정"="규칙"="정책"="내규", "가이드"="매뉴얼"="안내"="방법"="어떻게"
- 비격식 표현: "~어디있어?", "~알려줘", "~뭐야?", "~해줘", "~찾아줘"
- 부서명 변형: "사업본부"="사업부", "경영지원"="경영팀"="관리팀"
- 직급 변형: "대표"="대표이사"="CEO", "부사장"="부사", "팀장"="TL"
- 사람 찾기: "김OO 번호", "OOO 이메일", "OO팀 누구" → 인사정보에서 검색
- 문서 찾기: "택배 보내는 법", "출장 신청 어떻게" → 제목+내용+부가정보+OCR에서 검색
- 모호한 질문: 키워드가 여러 문서에 걸치면 가장 관련성 높은 것 위주로 답변하되, 관련 문서 목록 제시

## 답변 스타일
- 핵심 내용을 먼저 말하고, 상세는 관련 문서 참조를 안내
- 인사정보 질문은 이름/직급/부서/연락처를 표 형태로 정리
- 절차/방법 질문은 단계별로 정리

${context}`;

        const requestBody = {
            model: 'nvidia/nemotron-3-super-120b-a12b:free',
            messages: [
                { role: 'system', content: systemPrompt },
                ...chatMessages,
                { role: 'user', content: message }
            ],
            temperature: 0.3,
            max_tokens: 1024
        };

        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.error) {
            writeLog('ERROR', 'AI API 오류', JSON.stringify(data.error));
            return res.status(500).json({ error: 'AI 응답 생성에 실패했습니다.' });
        }

        const answer = data.choices?.[0]?.message?.content || 'AI 응답을 생성할 수 없습니다.';

        const docRefs = [];
        const docPattern = /\[DOC:(\d+)\]/g;
        let match;
        while ((match = docPattern.exec(answer)) !== null) {
            const docId = match[1];
            const post = posts.find(p => p.id === docId);
            if (post) {
                docRefs.push({ id: post.id, title: post.title, boardId: post.boardId });
            }
        }

        const cleanAnswer = answer.replace(/\[DOC:\d+\]/g, '').trim();

        writeLog('CHAT', `질문: ${message.substring(0, 50)}`, `user=${req.user.email}`);
        res.json({ answer: cleanAnswer, references: docRefs });

    } catch (err) {
        writeLog('ERROR', '챗봇 오류', err.message);
        res.status(500).json({ error: 'AI 응답 생성 중 오류가 발생했습니다.' });
    }
});

module.exports = router;

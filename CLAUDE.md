# NeoLAB KMS — Claude Code 프로젝트 컨벤션

이 파일은 Claude Code가 자동으로 읽어 프로젝트의 일관된 코드 작성 규칙을 따르도록 안내합니다. 사람이 읽어도 좋은 요약본 — 자세한 운영 가이드는 [인수인계.md](인수인계.md) 참고.

## 프로젝트 개요

- **이름**: NeoLAB Guidebook (사내 지식포탈, KMS) — https://kms.neolab.net
- **스택**: Node.js 20 / Express / SQLite (better-sqlite3) / PM2 / nginx / Google OAuth
- **운영 서버**: Ubuntu 22.04 ARM @ `/opt/neolab-kms`
- **저장소**: https://github.com/neolab-convergence/neolab-kms

## 🕐 시간대 — 모든 날짜는 KST 기준

**절대로 `new Date().toISOString().split('T')[0]` 패턴 사용 금지.** UTC라서 KST 자정~오전 9시 사이의 동작이 전날로 기록되는 버그를 유발합니다.

```js
// ❌ 잘못된 방식 (UTC)
const today = new Date().toISOString().split('T')[0];

// ✅ 올바른 방식 (KST)
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
```

이 규칙은 다음에 모두 적용:
- `routes/*.js` 의 모든 `date` 필드 생성
- `lib/logger.js` 의 일별 로그 파일명
- `server.js` 의 자동 백업 파일명
- `public/js/admin.js` 의 다운로드 파일명
- 클라이언트 사이드 모든 날짜 표시

## 💾 캐시버스터 — 프론트엔드 변경 시 반드시 +1

`public/index.html`의 모든 CSS/JS 링크는 `?v=NNN` 캐시버스터를 가집니다. **변경할 때마다 +1**:

```bash
# 현재 v=126이면 → v=127로
sed -i 's/?v=126/?v=127/g' public/index.html
```

또는 Edit 도구로 `replace_all: true` 사용. 변경 후 cache 무효화는 자동.

`public/index.html` HTML head에 캐시 무효화 meta가 들어 있어 iOS Safari 같은 강한 캐시도 다음 새로고침부터 즉시 반영됨.

## 🚢 배포 흐름 — 표준 5단계

```
1) 코드 수정 (로컬)
2) git add + commit + push origin main
3) ssh -i ~/.ssh/deploy-key-infra-kms -p 22022 ubuntu@130.162.139.142
4) cd /opt/neolab-kms && git pull origin main && pm2 restart kms
5) 라이브 검증 (응답 헤더, 기능 동작)
```

한 줄 버전:
```bash
ssh -i ~/.ssh/deploy-key-infra-kms -p 22022 ubuntu@130.162.139.142 \
  'cd /opt/neolab-kms && git pull origin main && pm2 restart kms'
```

PM2 process 이름은 `kms`, 절대 다른 이름 쓰지 말 것.

## 🛣️ Express 라우트 등록 순서 — 충돌 주의

특수 액션(reorder, bulk 등)을 `:id` 패턴보다 **위에** 등록해야 합니다. Express는 첫 매칭 우선이라 `/api/boards/reorder`가 `:id="reorder"`로 잘못 매칭되면 404.

```js
// ✅ 올바른 순서
router.put('/api/:sheetName/reorder', ...);   // 먼저
router.put('/api/boards/:id', ...);          // 나중

// ❌ 잘못된 순서 — 메뉴 순서 변경이 절대 작동 안 함
router.put('/api/boards/:id', ...);
router.put('/api/:sheetName/reorder', ...);
```

## 🚫 API 응답 캐시 — 모든 /api/* 는 no-store

`server.js`의 미들웨어가 `/api/*` 모든 응답에 자동으로 다음 헤더를 붙입니다:

```
Cache-Control: no-store, no-cache, must-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

**ETag도 비활성화** (`app.set('etag', false)`). 새 라우트 추가 시 추가 작업 불필요.

클라이언트(`public/js/core.js`)에서도 fetch에 `cache: 'no-store'` 옵션 자동 적용.

## 🗄️ SQLite 스키마 진화

`lib/sheets.js`의 `SHEET_HEADERS`에 컬럼만 추가하면 `initSheets()`가 자동으로 `ALTER TABLE` 실행. 별도 마이그레이션 스크립트 불필요.

```js
// 예: contacts 테이블에 새 컬럼 추가
contacts: ['id', 'name', 'position', 'dept', 'phone', 'mobile', 'email', 'status', 'newColumn'],
```

PM2 재시작만으로 라이브 DB에 반영됨. 기존 행은 빈 문자열로 채워짐.

## 🧊 캐시 계층

3중 캐시 이해:

| 위치 | TTL | 무효화 방법 |
|---|---|---|
| 클라이언트 `dataCache` (core.js) | 15초 | `invalidateAll()` 또는 `invalidate(path)` |
| 서버 `lib/sheets.js` cache | 30초 | `invalidateCache(sheetName)` |
| 브라우저 자체 캐시 | 무제한 | 캐시버스터 `?v=N` + HTML meta |

**라우트에서 데이터 변경 시** 반드시 서버 캐시 무효화:
```js
await appendRow('contacts', data);
invalidateCache('contacts');   // ← 필수
res.json({ success: true });
```

## 🔐 인증

- 미들웨어: `requireAuth` (로그인된 모든 사용자), `requireAdmin` (관리자만)
- 모든 비-API HTML 경로는 미인증이면 `/login.html`로 리다이렉트
- API 응답 401은 클라이언트가 감지해 자동으로 로그인 페이지 이동
- 점검 모드(maintenance) 시 관리자 외 모두 `/maintenance.html`

## 🖼️ 모바일 CSS 우선순위

`@media (max-width: 1024px)` 안의 일부 스타일이 `!important`로 강제됩니다. JS에서 inline style로 override할 때:

```js
// ❌ 안 먹힘 (mobile CSS의 !important에 짐)
el.style.display = 'none';

// ✅ 먹힘
el.style.setProperty('display', 'none', 'important');
// 복원할 때
el.style.removeProperty('display');
```

특히 `#boardGalleryContainer`, `#boardGridContainer`, `.mobile-tabbar`에 적용.

## 🆔 ID 생성 컨벤션

대부분의 신규 행은 `id: String(Date.now())`. 충돌 가능성 있는 일괄 INSERT는 `Date.now() + i` 사용:

```js
// 일괄 INSERT 시
const baseId = Date.now();
items.forEach((it, i) => stmt.run(String(baseId + i), ...));
```

## 🚪 검색 결과/대시보드 위젯에서 게시물 열기

`openPost(id)` 직접 호출 ❌ → `goToBoardAndOpen(boardId, id)` 사용 ✅
- `openPost`는 현재 활성 보드 섹션 안에 detail view를 표시하는데, 검색 결과 페이지 등에서는 보드 섹션이 비활성이라 안 보임
- `goToBoardAndOpen`은 `navigateTo(boardId)`로 보드 활성화 후 0.3초 뒤 openPost — 항상 정상 표시

`goToBoardAndOpen`은 `menuItem.click()` 절대 사용 X (이미 expanded면 collapse 토글로 동작) — 반드시 `navigateTo()` 직접 호출.

## 📊 로깅

서버 로그는 KST 타임스탬프로 `/opt/neolab-kms/logs/YYYY-MM-DD.log`에 일별 저장. `lib/logger.js` 의 `writeLog(type, message, details)` 사용.

타입: `ACCESS`, `INFO`, `ADMIN`, `BACKUP`, `ERROR`, `WARN`

`[ADMIN]` 로그는 관리자 동작 추적용. 게시물 추가/수정/삭제, 권한 변경 등 모두 기록.

## 🎯 자주 발생하는 작업 패턴

### 새 데이터 필드 추가
1. `lib/sheets.js` SHEET_HEADERS에 컬럼명 추가
2. `routes/<resource>.js` POST 핸들러에 `req.body.field || ''` 추가 (PUT은 spread로 자동 통과)
3. 프론트 admin 폼에 input + 저장 시 data 객체에 포함
4. 프론트 사용자 표시에 렌더링 추가
5. 캐시버스터 `?v=N` +1
6. commit + push + 운영 서버 pull + pm2 restart

### 빠른 라이브 검증
```bash
# 응답 헤더 (캐시 정책 등)
curl -sI https://kms.neolab.net/login.html | grep -iE "cache|etag"

# 라이브 DB 컬럼 (인계자가 SSH 접속 가능할 때)
ssh -i ~/.ssh/deploy-key-infra-kms -p 22022 ubuntu@130.162.139.142 \
  'cd /opt/neolab-kms && node -e "
    const db = require(\"better-sqlite3\")(\"data/kms.db\", {readonly:true});
    console.log(db.prepare(\"PRAGMA table_info(<table>)\").all().map(r=>r.name));
  "'
```

## 🛡️ 데이터 안전성

- 매일 KST 자정 자동 백업: `/opt/neolab-kms/backups/auto_backup_YYYY-MM-DD.json`
- 30일 이상 된 백업은 자동 삭제됨
- 게시물/연락처/개선요청 삭제는 영구 삭제 (휴지통 없음) — 신중하게
- "완료 처리"가 권장되는 기능: 개선요청 (히스토리 보존)

## 🚦 변경 후 체크리스트

큰 변경 후 다음을 모두 통과해야 안전:

- [ ] `node --check <변경 파일>` 구문 통과
- [ ] 캐시버스터 `?v=N` +1
- [ ] 백엔드 변경 시 PM2 재시작
- [ ] 모바일 viewport (1024px 이하)에서도 동작 확인
- [ ] iOS Safari로 Ctrl+Shift+R 또는 query bust 후 확인
- [ ] 라이브 응답 헤더에 `Cache-Control: no-store` 적용 확인 (API)
- [ ] DB 스키마 변경 시 `PRAGMA table_info` 로 컬럼 추가 확인

## 📝 커밋 메시지 컨벤션

3가지 prefix 사용:
- `Add: <설명>` — 새 기능
- `Fix: <설명>` — 버그 수정
- `Remove: <설명>` — 제거 작업

본문에 원인·수정·영향을 줄여서 요약. Co-Authored-By 라인 포함.

## 🆘 막히면

[인수인계.md](인수인계.md)의 "트러블슈팅" 섹션 참고. 또는 git history (`git log --oneline -30`)에서 비슷한 작업 사례 검색.

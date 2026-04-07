# AIPOT Backend (PRD v1.3)

NestJS 기반 AIPOT 백엔드입니다. PRD v1.3의 핵심 규칙을 서버 인가/상태전이 관점에서 반영했습니다.

## 핵심 반영 사항

- 권한 체계: Guest / FREE / PRO
- 로그인: ID(닉네임) + Password + JWT
- Swagger UI 제공: /swagger
- 룸 생성 후 자동 시작 금지, START GAME 수동 시작
- 룸 상태 전이 및 핸드 단계 관리
- 좌석/봇 관리 규칙(빈 좌석만 봇 추가, 진행 중 변경 금지)
- 로비 카테고리 분리(AI Bot / Cash / Tournament)
- LLM 멀티 프로바이더 지원
  - OpenAI
  - Claude
  - Gemini
  - Local LLM (기본값)

## 빠른 실행

1. 환경변수 복사

```bash
cp .env.example .env
```

2. 의존성 설치 및 실행

```bash
npm install
npm run start:dev
```

3. 문서 확인

- Swagger UI: http://localhost:3000/swagger
- Health: http://localhost:3000/

## 환경변수

.env.example 참고

- JWT_SECRET
- JWT_EXPIRES_IN
- DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME
- DB_SYNCHRONIZE
- OPENAI_API_KEY / OPENAI_MODEL
- ANTHROPIC_API_KEY / ANTHROPIC_MODEL
- GEMINI_API_KEY / GEMINI_MODEL
- LOCAL_LLM_BASE_URL / LOCAL_LLM_MODEL

## MySQL 설정

- 기본 DB 드라이버는 MySQL입니다(TypeORM).
- 애플리케이션 상태(users/rooms/hand-reviews)는 `state_snapshots` 테이블에 스냅샷으로 저장/복원됩니다.
- 로컬 개발 시 `DB_SYNCHRONIZE=true`로 두고, 운영에서는 `false` 권장입니다.

## Local LLM 연동

기본 핸드리뷰/봇 액션 provider는 local입니다.

- 로컬 서버 프로젝트: https://github.com/Dvely/Dvely_LLMserver
- 현재 백엔드는 OpenAI-compatible chat/completions 형태를 기본 호출 형식으로 사용합니다.
- LOCAL_LLM_BASE_URL 을 로컬 서버 엔드포인트로 맞춰주세요.

## 주요 API 그룹

- auth
  - sign-up, sign-in, guest-session, me, sign-out, change-password
- lobby
  - tables, tournaments, quick-play
- rooms
  - create/join/convert/start/leave/close
  - take seat / leave seat / add bot / update bot / remove bot
- game
  - state, act, timer-sync, next-hand
- profile
  - me, stats, avatar update, password update
- hand-review
  - hands list/detail, analyze
- ai
  - bot-action, hand-review

## 권한 정책 요약

- Guest
  - Tournament / Create Table / Paid AI / Hand Review 제한
- FREE
  - Paid AI, Hand Review 심화 분석 제한
- PRO
  - Paid AI + Hand Review 심화 분석 허용

## 검증

```bash
npm run build
npm run test -- --runInBand
npm run test:e2e -- --runInBand
```

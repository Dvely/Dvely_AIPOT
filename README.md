# AIPOT MVP Monorepo

PRD v1.0 기준으로 구성한 초기 MVP 구조입니다.

## 구조

- `frontend`: React + Vite 기반 반응형 웹 UI
- `backend`: NestJS 기반 API 서버 (MySQL + JWT + Swagger)

## PRD 반영 범위 (MVP)

- 로비 메인 + 빠른 시작 흐름
- AI 봇 추천/난이도/테이블(헤즈업/6인/9인) 선택 UI
- 회원/게스트 모드 분기
- 오늘의 미션/최근 복기 카드
- 복기 타임라인(EV/Equity) 및 프리미엄 분석 영역
- 비현금성 게임머니 컨텍스트 노출

## 실행 방법

### 1) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev
```

기본 주소: `http://localhost:3000/api`

Swagger UI: `http://localhost:3000/api/docs`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

기본 주소: `http://localhost:5173`

## API 요약

- `GET /api` : health
- `POST /api/auth/register` : 회원가입 + JWT 발급
- `POST /api/auth/login` : 로그인 + JWT 발급
- `GET /api/auth/me` : JWT 사용자 정보
- `GET /api/lobby?mode=guest|member` : 로비 데이터
- `POST /api/lobby/quick-start` : 빠른 시작 세션 생성
- `GET /api/bots?tableType=6-max&tier=all` : 봇 목록
- `GET /api/missions/today` : 오늘의 미션
- `GET /api/reports/recent` : 최근 복기 리포트
- `GET /api/reports/:reportId?premium=true|false` : 리포트 상세

## 백엔드 환경 변수

- `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`
- `DB_SYNCHRONIZE` (개발환경 `true` 권장)
- `JWT_SECRET`, `JWT_EXPIRES_IN`

## 참고

- 현재 게임/복기 데이터는 MVP 목업 데이터(인메모리)입니다.
- 사용자 계정은 MySQL `users` 테이블에 저장됩니다.
- 실제 상용 단계에서는 마이그레이션, Refresh Token, RBAC, 감사 로그를 추가하는 것을 권장합니다.

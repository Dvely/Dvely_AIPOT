# AIPOT AI 핵심 기능 설계

## 1. 설계 목표
AIPOT의 AI 계층은 다음 두 가지를 동시에 만족하도록 설계되어 있습니다.

- 실전형 플레이 상대 제공: 성향과 난이도를 조절 가능한 AI BOT
- 학습형 피드백 제공: 핸드 종료 후 액션 단위 전략 코칭

즉, 단순 게임 AI가 아니라 플레이 루프와 복기 루프를 하나의 학습 사이클로 연결합니다.

## 2. AI 기능 맵

| 기능 | 핵심 API | 내부 엔진 | 출력 |
|---|---|---|---|
| BOT 행동 결정 | POST /ai/bot-action | AiService.generateBotAction | action, amount, reason, confidence |
| 단일 핸드 코멘트 | POST /ai/hand-review | AiService.analyzeHandReview | markdown 분석 텍스트 |
| 전체 액션 일괄 분석 | POST /hand-review/hands/:handId/analyze | HandReviewService + AiService.analyzeAllHandActions | summary + 액션별 EV/Equity/Mix |
| 분석 상태 추적 | GET /hand-review/hands/:handId/analyze-status | HandReviewAnalyzeJob | pending/running/completed/failed |

## 3. AI BOT 지침 설계

### 3.1 입력 컨텍스트 설계
BOT 의사결정 입력은 단순 상태가 아닌 의사결정 중심 컨텍스트를 포함합니다.

- gameState: 스트리트, 보드, 팟, 최소콜/레이즈 등
- accumulatedState: 누적 액션과 좌석 상태
- decisionContext.actorSnapshot: toCall, minRaiseTo, stack, holeCards, position
- decisionContext.previousActionsThisStreet: 현재 스트리트의 선행 액션 로그

핵심은 모델이 전체 로그를 장문으로 추론하기보다, 현재 노드에서 필요한 정보에 집중하도록 만드는 것입니다.

### 3.2 시스템 프롬프트 지침
AiService는 다음 원칙을 강제합니다.

- No-Limit Hold'em 전용
- 제공된 누적 상태만 사용
- 숨겨진 카드 추정 금지
- 행동 집합 고정: fold/check/call/bet/raise/all-in
- 출력 형식 고정: strict JSON
- 스타일 반영: balanced/aggressive/tight

### 3.3 출력 계약
BOT 응답은 아래 스키마를 반드시 만족하도록 설계되었습니다.

```json
{
  "action": "fold|check|call|bet|raise|all-in",
  "amount": 1200,
  "reason": "string",
  "confidence": 0.0
}
```

### 3.4 정규화 규칙
모델 출력은 바로 적용하지 않고 정규화 단계 후 반영합니다.

- 허용 액션 외 값은 check로 치환
- 금액은 정수, 0 이상으로 보정
- confidence는 0~1 범위로 clamp
- 룸 상태(스택, 최소 레이즈, 콜 필요금액)로 2차 검증
- 불가능한 액션은 call/check/all-in 등 합법 액션으로 재매핑

### 3.5 권한/모델 티어 정책
- modelTier=paid는 PRO만 허용
- FREE/GUEST는 유료 모델 접근 차단
- RANDOM 티어는 custom RNG 엔진으로 의도적 변칙성 제공

### 3.6 실패 대응 및 복원력
- provider timeout 기본 5초
- BOT 의사결정은 fallbackBotAction으로 즉시 대체 가능
- GameService는 BOT 결정에서 Promise.race를 사용해 지연 상한을 둠
- 로컬 LLM 호환 이슈 대응: response_format(json_object) 실패 시 해제 후 재시도

## 4. 핸드 리뷰 분석 설계

### 4.1 분석 모드 이원화
- 경량 동기 분석: analyzeHandReview
- 고품질 비동기 분석: analyzeAllHandActions (권장 플로우)

전체 분석은 HandReviewService가 큐잉한 뒤 백그라운드에서 실행합니다.

### 4.2 Hero 관점 강제
핸드 분석은 항상 HERO 중심으로 작성됩니다.

- HERO action: 의사결정 품질 평가
- Opponent action: 상대 카드 단정 대신 HERO 대응 전략 코칭

이를 프롬프트 레벨에서 명시적으로 강제해 해설 일관성을 확보합니다.

### 4.3 액션 단위 구조화 출력
각 액션은 다음 필드를 목표로 합니다.

- analysis: 코칭 텍스트
- evBb: EV(bb)
- heroEquity: 0~100
- gtoMix: check/call/fold/raise/allIn 비율

정규화 규칙:

- evBb: 소수점 2자리
- heroEquity: 0~100 clamp
- gtoMix: 총합 100%로 재정규화

### 4.4 누락 액션 보강 전략
LLM 응답에서 일부 action order가 누락될 수 있으므로 3단계 보강을 수행합니다.

1. 1차 응답 파싱(JSON/action 배열)
2. 누락 order만 재요청(requiredOrdersOnly)
3. 여전히 누락 시 narrative 파싱 + 로컬 결정적 fallback 문장 생성

이 구조 덕분에 프론트는 항상 전체 액션 리뷰를 안정적으로 렌더링할 수 있습니다.

### 4.5 비동기 작업 상태 모델
HandReviewAnalyzeJob 상태 전이:

- pending -> running -> completed
- 예외 시 failed

프론트는 analyze-status를 주기적으로 폴링하고 completed 시 상세를 재조회하여 저장 결과를 반영합니다.

### 4.6 영속화 설계
분석 결과는 HandReviewRecord.analyses[]에 누적 저장됩니다.

HandActionAnalysis 핵심 필드:

- handId, actionOrder, seatId, playerId
- provider, model
- analysis, evBb, heroEquity, gtoMix
- createdByUserId, createdAt

## 5. 다국어 출력 설계
지원 언어: en, ko, ja

- 프롬프트에 언어 지시 + strict language instruction 동시 적용
- 한국어/일본어 모드에서 타 언어 문장 혼입 방지
- EV/GTO/BB 같은 기술 약어만 영어 유지 허용
- 실패 메시지도 언어별로 로컬라이징

## 6. 안정성/운영 설계

- maxTokens 상한 사용으로 과도 응답 억제
- provider별 호출 어댑터 분리(OpenAI/Claude/Gemini/Local)
- 응답 JSON 파서가 fenced text/혼합 텍스트를 복구 파싱
- 서버 재시작/종료 시 in-flight 분석 잡을 failed로 정리
- Store snapshot으로 users/rooms/hand reviews 복구

## 7. 발표용 핵심 메시지

1. 플레이와 학습의 폐루프
- 실전 플레이 즉시, 액션 단위 AI 복기로 연결

2. 제어 가능한 AI 상대
- 모델(provider/tier), 성향(style), 권한(policy)을 분리해 운영

3. 실서비스형 안정성
- 타임아웃, 폴백, 누락 보정, 비동기 잡 상태관리까지 반영

4. 확장 가능한 구조
- Provider 추가, 프롬프트 버전 관리, 분석 지표 확장이 쉬운 모듈 경계

## 8. 다음 단계 제안

- Solver/GTO 엔진 연동으로 EV 근거 정밀도 강화
- 플레이어 성향 기반 개인화 코칭(실수 패턴 클러스터링)
- 분석 품질 관측 지표(누락률/재요청률/완료시간) 대시보드화
- 프롬프트 버전 A/B 테스트 및 모델 라우팅 최적화

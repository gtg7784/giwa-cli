# GIWA CLI

[English](README.md) | [한국어](README.ko.md)

GIWA CLI는 GIWA OP Stack L2 개발자 도구입니다.

Foundry를 대체하지 않고 보완합니다. 컨트랙트 호출, 트랜잭션 전송, 스토리지
조회처럼 일반적인 EVM 작업은 `cast`, `forge`, `anvil`에 맡깁니다. GIWA CLI는
GIWA 네트워크 메타데이터 또는 OP Stack 크로스 도메인 지식이 필요한 워크플로에
집중합니다.

- OP Stack withdrawal 상태 조회, 대기, prove, finalize
- L1 데이터, L2 실행, operator 수수료 분해
- deposit과 withdrawal을 인식하는 트랜잭션 설명
- 셸과 Foundry용 GIWA 네트워크 설정 내보내기
- GIWA 워크스페이스 진단과 의존성 없는 프로젝트 스캐폴딩

## 상태

GIWA CLI의 현재 버전은 `0.1.0`이며 GIWA Sepolia를 대상으로 합니다.

기본 제공 네트워크:

| 별칭 | 체인 ID | 레이어 |
| --- | ---: | --- |
| `giwa-sepolia` | `91342` | L2 |
| `ethereum-sepolia` | `11155111` | L1 |

## 요구 사항

- [Bun](https://bun.sh/)
- [pnpm](https://pnpm.io/) 11

## 소스에서 설치

```bash
git clone <repository-url>
cd giwa-cli
pnpm install
pnpm build
pnpm link --global
```

설치를 확인합니다.

```bash
giwa --version
giwa --help
```

전역 링크 없이 소스를 직접 실행할 수도 있습니다.

```bash
bun src/cli.ts --help
```

## 빠른 시작

기본 GIWA Sepolia 네트워크를 조회하고 검증합니다.

```bash
giwa network list
giwa network info giwa-sepolia
giwa network health giwa-sepolia
```

워크스페이스를 초기화하고 검사합니다.

```bash
giwa init my-project
giwa doctor my-project
```

활성 네트워크를 셸 환경 변수 형식으로 내보냅니다.

```bash
giwa network export
```

Foundry RPC 설정 조각으로 내보냅니다.

```bash
giwa network export giwa-sepolia --format foundry
```

OP Stack 트랜잭션을 설명합니다.

```bash
giwa tx explain 0x<transaction-hash>
```

OP Stack 수수료 구성 요소 전체를 추정합니다.

```bash
giwa fee estimate \
  --from 0x<sender-address> \
  --to 0x<recipient-address> \
  --value 0
```

## 명령어 레퍼런스

### 전역 옵션

```text
--json                  구조화된 JSON 출력
--quiet                 성공 출력 숨김
--no-color              색상 출력 비활성화
--timeout <ms>          RPC 타임아웃 설정
--confirmations <count> 영수증 확인 블록 수 설정
```

quiet 모드에서도 오류는 출력됩니다. 프로세스 종료 코드는 다음과 같습니다.

| 코드 | 의미 |
| ---: | --- |
| `0` | 성공 |
| `2` | 잘못된 사용법 또는 입력 |
| `3` | 설정 오류 |
| `4` | 네트워크 오류 |
| `5` | 외부 도구 또는 서비스 오류 |
| `70` | 예상하지 못한 내부 오류 |

### 네트워크

```bash
giwa network list
giwa network info [alias]
giwa network health [alias]
giwa network use <alias>
giwa network export [alias] --format env
giwa network export [alias] --format foundry
```

사용자 정의 네트워크를 추가합니다.

```bash
giwa network add <alias> \
  --chain-id <id> \
  --rpc-url <url> \
  --explorer-url <url> \
  [--name <name>] \
  [--layer L1|L2] \
  [--currency-name <name>] \
  [--currency-symbol <symbol>] \
  [--currency-decimals <count>] \
  [--portal <address>] \
  [--l1-standard-bridge <address>] \
  [--dispute-game-factory <address>] \
  [--source-id <l1-chain-id>]
```

기본 설정 파일 경로:

```text
~/.config/giwa/config.json
```

다른 디렉터리를 사용하려면 `GIWA_CONFIG_DIR`을 설정합니다.
`XDG_CONFIG_HOME`도 지원합니다.

### Bridge withdrawal

Bridge 명령은 withdrawal을 시작한 L2 트랜잭션 해시를 입력받습니다. 하나의
트랜잭션에서 여러 withdrawal이 발생했다면 `--log-index`로 선택합니다.

```bash
giwa bridge status <l2-transaction-hash>
giwa bridge wait <l2-transaction-hash> --for prove
giwa bridge prove <l2-transaction-hash>
giwa bridge wait <l2-transaction-hash> --for finalize
giwa bridge finalize <l2-transaction-hash>
```

다른 L2 설정을 사용하려면 `--network <alias>`를 지정합니다.

`status`와 `wait`는 읽기 전용입니다. `prove`와 `finalize`는 L1 트랜잭션을
전송하므로 private key가 필요합니다.

```bash
export GIWA_PRIVATE_KEY=0x<32-byte-private-key>
giwa bridge prove 0x<l2-transaction-hash>
```

키는 프로세스 환경에서만 읽으며 GIWA 설정에 기록하지 않습니다. 반드시 비밀로
취급해야 합니다. Bridge 쓰기 명령은 withdrawal이 필요한 상태에 도달하면 즉시
트랜잭션을 브로드캐스트합니다.

### 트랜잭션 설명

```bash
giwa tx explain <transaction-hash> [--log-index <index>] [--network <alias>]
```

다음 정보를 제공합니다.

- 영수증 상태와 트랜잭션 유형
- L2 실행 수수료
- 영수증에 포함된 경우 실제 L1 데이터 수수료
- deposit 메타데이터
- 디코딩된 `MessagePassed` withdrawal

실제 L1 수수료 메타데이터를 확인할 수 없다면 누락된 수수료를 0으로 처리하지
않고 총액이 불완전하다고 명시합니다.

### 수수료 추정

```bash
giwa fee estimate \
  --from <address> \
  [--to <address>] \
  [--value <wei>] \
  [--data <hex>] \
  [--network <alias>]
```

추정 결과를 다음 요소로 분리합니다.

- L1 데이터 수수료와 L1 gas 사용량
- L2 gas, gas price, 실행 수수료
- 체인이 지원하는 경우 operator 수수료
- 전체 예상 수수료

값은 wei 단위로 출력합니다. JSON 출력에서도 큰 정수의 정밀도를 잃지 않습니다.

### 워크스페이스와 프로젝트 명령

```bash
giwa init [directory] [--network <alias>]
giwa doctor [directory]
giwa create contract <name>
giwa create app <name>
```

생성되는 컨트랙트는 의존성 없는 Foundry 프로젝트입니다. 생성되는 앱은 의존성
없는 Bun 브라우저 애플리케이션입니다.

## 기계 판독 출력

스크립트와 CI에서는 `--json`을 사용합니다.

```bash
giwa --json network info giwa-sepolia
giwa --json tx explain 0x<transaction-hash>
```

종료 코드만 필요하다면 `--quiet`을 사용합니다.

```bash
giwa --quiet network health giwa-sepolia
```

네트워크 export는 일반 출력에서 셸이나 설정 파일이 바로 사용할 수 있는 원문을
출력합니다. JSON 모드에서는 생성된 내용을 네트워크 별칭 및 형식과 함께
감쌉니다.

## 개발

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm check
pnpm build
```

테스트 스위트는 Bun을 사용합니다. TypeScript strict 모드를 적용하고 Biome으로
포맷과 lint를 검사합니다.

## 라이선스

MIT

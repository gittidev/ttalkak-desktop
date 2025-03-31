# 🖥️ Ttalkak - Git 기반 자동 배포 데스크탑 앱

Ttalkak(딸깍)은 Git 커밋 정보를 기반으로 Dockerfile을 자동 생성하고,  
Docker 이미지 빌드 → 컨테이너 실행 → 상태 모니터링까지 원클릭으로 처리할 수 있는  
Electron 기반 데스크탑 앱입니다.

개발자의 반복적인 배포 작업을 줄이고, 실시간으로 상태를 모니터링하여  
개발-운영 흐름을 간결하게 연결해주는 **배포 자동화 도구**입니다.

---

## 🚀 주요 기능

- Git 정보 기반 Dockerfile 자동 생성
- One-Click 배포 (Build → Run → 상태 확인)
- 로컬 Docker 컨테이너 상태 실시간 감지 및 UI 반영
- 서버로 상태를 주기적으로 헬스체크 전송
- WebSocket 연동을 통한 실시간 피드백 처리
- Electron IPC 통신 구조 및 보안 contextBridge 설계
- 배포 이력, CPU 사용률 등 시스템 정보 시각화

---

## 📁 폴더 구조 (요약)

```
Ttalkak/
├── .eslintrc.cjs
├── electron-builder.json5
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── electron/                         # 메인 프로세스 (Electron Core)
│   ├── main.ts                       # Electron 앱 진입점
│   ├── preload.ts                    # contextBridge 정의
│   ├── utils.ts                      # 공통 유틸
│   ├── ipc/                          # IPC 요청 핸들러
│   │   └── ipcHandlers.ts
│   └── managers/                    # Docker 관련 관리 모듈
│       ├── dockerContainerManager.ts
│       ├── dockerImageManager.ts
│       ├── dockerLogsManager.ts
│       ├── dockerStatusManager.ts
│       ├── dockerUtils.ts
│       └── filemanager/             # 파일 생성/설정 유틸
│           ├── dockerFileMaker.ts
│           ├── envFileMaker.ts
│           └── downloadManager.ts
│
├── src/                              # 렌더러 프로세스 (UI 영역)
│   ├── main.tsx                      # React 앱 진입점
│   ├── pages/                        # 주요 페이지
│   │   ├── Home.tsx
│   │   ├── DashBoard.tsx
│   │   └── Port.tsx
│   ├── components/                  # 공통 UI 컴포넌트
│   │   ├── Header.tsx
│   │   ├── SideNavBar.tsx
│   │   └── ui/                       # UI 유틸 컴포넌트
│   │       ├── switch.tsx
│   │       └── tabs.tsx
│   ├── features/                    # 도메인별 기능 컴포넌트
│   │   ├── auth/                    # 로그인/설정 모달
│   │   ├── dashboard/               # 컨테이너/이미지 리스트
│   │   └── home/                    # CPU, 결제 상태
│   ├── services/                    # 핵심 비즈니스 로직
│   │   ├── deployments/             # 배포 관련 유틸
│   │   ├── monitoring/              # 상태 체크 관련 유틸
│   │   └── websocket/               # WebSocket 관리 유틸
│   ├── stores/                      # Zustand 전역 상태 관리
│   ├── axios/                       # API 모듈
│   └── types/                       # 타입 정의

```

---

## ⚙️ 기술 스택

- **Electron** / React / TypeScript / Zustand / TailwindCSS  
- **Dockerode**, fs, pgrok  
- **Next.js App Router** (가이드 문서)  
- **Putty**, **Terminus** (서버 접근 테스트)

---

## 🧪 실행 방법

```bash
# 설치
npm install

# 개발 모드 실행
npm run dev

# 빌드
npm run build

---
🛠️ 주요 구현 포인트
Electron의 contextBridge를 활용한 안전한 IPC 채널 설계

Docker 제어 로직을 싱글톤 인스턴스로 분리하여 안정성 확보

Git 정보 파싱부터 Dockerfile 생성 → 빌드 → 실행까지 유틸 함수 체계화

컨테이너 상태 감지를 기반으로 실시간 렌더링 및 서버 헬스체크 연동

구조는 역할 단위로 모듈화되어 유지보수성과 확장성이 뛰어남

---

🧠 회고 (Reflection)
설계가 부족한 상태에 시작된 프로젝트였기 때문에, 초기 기획과 흐름을 FigJam으로 직접 설계하며 진행 방향을 정리하는 데 많은 시간이 소요되었습니다.

Electron 개발 경험이 없던 상태에서 시작해 IPC 구조, contextBridge 보안 설계, Docker 연동 등 낯선 개념을 하나씩 직접 학습하고 적용하며 성장할 수 있었습니다.

다양한 문제 상황을 직접 해결하면서 프론트엔드 개발자가 시스템 환경까지 이해해야 진짜 실용적인 제품을 만들 수 있다는 것을 체감했습니다.

개인적으로 Putty, Terminus, Docker, fs 등 백엔드/인프라 지식에 대한 필요성을 느끼고 학습하게 된 계기가 되었습니다.

---
### 🧩 트러블슈팅 (Troubleshooting)

| 문제 상황                                                                 | 해결 방법                                                                                      |
|---------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| 백엔드 API 구조가 잦은 변경으로 타입 및 실행 흐름이 자주 깨짐             | 프론트 단에서 로직을 유연하게 처리하고 타입 정의를 재정의하는 방식으로 대응                      |
| Electron IPC 구조 이해 부족으로 통신 흐름 혼선 및 앱 발열 발생             | 메인/렌더러 역할 분리, 싱글톤 패턴 + contextBridge 기반으로 리팩토링                             |
| `fs`와 Docker 환경에서의 파일 접근/권한 문제                              | 권한 설정을 위한 별도 유틸 파일 작성                             |
| 컨테이너 상태 렌더링 시 리렌더 성능 저하                                  | 상태 변화에만 반응하도록 Zustand store를 최소 단위로 분리하여 렌더링 최적화                     |
| 초기 구조 미비로 배포 단계별 로직이 혼재                                   | Git 파싱 → Dockerfile 생성 → 빌드 → 실행 흐름을 유틸/서비스 단위로 분리하여 계층화              |




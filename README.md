# Spin Coating Thin-Film Uniformity Simulator

성균관대학교 화학공학부 유체역학 텀프로젝트용 스핀 코팅 박막 균일도 웹 시뮬레이터입니다.

## 실행 (브라우저에서 보기)

터미널을 **프로젝트 폴더**에서 열고, 아래를 **순서대로** 실행하세요.

```powershell
cd C:\Users\tjgus\Projects\spin-coating-simulator
npm install
npm run dev
```

1. **`npm install`** — 패키지를 한 번만 설치합니다. 화면에 `npm WARN optional SKIPPING...` 이 많이 나와도 **정상**입니다 (Linux/Mac용 부품을 Windows에서 건너뛴다는 뜻). 마지막에 `added ... packages` 또는 `up to date`가 보이면 성공입니다.
2. **`npm run dev`** — 개발 서버를 켭니다. **이 명령을 실행해야** 시뮬레이터를 볼 수 있습니다. `npm install`만으로는 브라우저가 열리지 않습니다.
3. 터미널에 나오는 주소를 브라우저에서 엽니다. 보통 **`http://localhost:5173`** 입니다.
4. 서버를 끌 때는 터미널에서 `Ctrl + C` 를 누릅니다.

> Cursor 터미널에서 `npm install` 버튼만 누른 경우: 설치만 되고 서버는 안 켜집니다. 같은 폴더에서 `npm run dev` 를 한 번 더 실행하세요.

### `Cannot use import statement outside a module` 가 나올 때

PC에 **Node.js 12** 같은 구버전이 `C:\Program Files\nodejs` 에 남아 있으면 `npm run dev` 가 실패합니다. **Node 18 이상(LTS 20·22 권장)** 이 필요합니다.

1. 터미널에서 확인:
   ```powershell
   node -v
   & "C:\Program Files\nodejs\node.exe" -v
   ```
   둘 중 하나라도 `v12` 이면 [nodejs.org](https://nodejs.org) 에서 **LTS** 설치(기존 항목 덮어쓰기).
2. **Cursor를 완전히 종료** 후 다시 열고 `node -v` 가 `v20` 또는 `v22` 인지 확인.
3. 다시 `npm run dev` → 브라우저에서 `http://localhost:5173`

이 프로젝트의 `npm run dev` 는 구버전 Node일 때 Cursor 내장 Node로 우회 실행하도록 되어 있습니다. 그래도 **시스템 Node를 LTS로 올리는 것**을 권장합니다.

## 기능

- **Euler solver**: `dh/dt = -(2ρω²h³)/(3η) - E`, gelation at C≥1 or h≤h_f (Meyerhofer)
- **Core View**: h(t) 애니메이션, t_gel / 최종 두께 메트릭 카드
- **Validation**: E=0 수치해 vs EBP 해석해 오버레이
- **Process Design**: Edge bead 가우시안 단면, ±2% spec 밴드


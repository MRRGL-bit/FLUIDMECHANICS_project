const major = parseInt(process.version.slice(1).split(".")[0], 10);

if (major < 18) {
  console.error("");
  console.error("Node.js 버전이 너무 낮습니다:", process.version);
  console.error("npm이 사용 중인 실행 파일:", process.execPath);
  console.error("");
  console.error("Vite 6은 Node 18 이상이 필요합니다.");
  console.error("해결: https://nodejs.org 에서 LTS(20 또는 22)를 설치한 뒤");
  console.error("      Cursor를 완전히 종료했다가 다시 연 다음,");
  console.error("      터미널에서 node -v 가 v18 이상인지 확인하세요.");
  console.error("");
  process.exit(1);
}

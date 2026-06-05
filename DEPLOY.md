# 지원사업 통합 모니터 배포 안내

이 저장소는 한국사회복지관협회와 서울시사회복지관협회의 지원사업 게시판을 한 화면에서 보는 Vercel 배포용 사이트입니다.

## Vercel 배포

1. https://vercel.com 에 로그인합니다.
2. `Add New Project`를 누릅니다.
3. GitHub 저장소 `dongdongk24-collab/dong`을 선택합니다.
4. 기본 설정 그대로 `Deploy`를 누릅니다.
5. 배포가 끝나면 `https://...vercel.app` 주소로 접속합니다.

## 실시간 동작

- 화면이 `/api/posts`를 호출합니다.
- Vercel 서버리스 API가 두 게시판을 직접 인터넷에서 가져옵니다.
- 기본 캐시는 180초입니다.
- `새로고침` 버튼을 누르면 새 요청을 보내 최신 목록을 다시 확인합니다.

## 파일 구조

```text
api/posts.js        # 게시판 수집 API
public/index.html   # 화면
public/app.js       # 검색, 필터, 렌더링
public/styles.css   # 스타일
vercel.json         # Vercel 캐시 설정
package.json        # Node/Vercel 프로젝트 설정
```

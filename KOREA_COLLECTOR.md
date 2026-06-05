# 한국 서버 수집 API 배포

Vercel 서버에서 일부 국내 사이트가 `403` 또는 `timeout`으로 막힐 때 쓰는 별도 수집 API입니다.

## 1. 한국 Node 서버에 배포

Cloudtype, Cafe24 Node 호스팅, Naver Cloud 등 한국 리전에 가까운 Node 서버에 이 GitHub 저장소를 연결합니다.

실행 명령은 아래처럼 설정합니다.

```bash
npm run collector
```

서버가 뜨면 아래 주소가 정상이어야 합니다.

```text
https://배포주소/health
https://배포주소/api/posts
```

`/health`가 `resource collector ok`를 반환하면 서버가 켜진 것입니다.

## 2. Vercel 화면과 연결

한국 서버 주소가 예를 들어 아래와 같다면:

```text
https://my-resource-api.example.com
```

Vercel 사이트를 한 번 이렇게 엽니다.

```text
https://현재-vercel-주소.vercel.app?api=https://my-resource-api.example.com
```

그러면 브라우저에 해당 API 주소가 저장되고, 이후에는 일반 Vercel 주소로 들어가도 한국 서버 API를 사용합니다.

## 3. 다시 Vercel 기본 API로 돌리기

브라우저 개발자도구 콘솔에서 아래를 실행합니다.

```js
localStorage.removeItem('resourceApiBase')
```

그 뒤 새로고침하면 Vercel 기본 `/api/posts`를 다시 사용합니다.

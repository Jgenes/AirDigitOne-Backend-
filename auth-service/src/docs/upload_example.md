Upload example — profile with image

This document shows two quick ways to test the profile upload endpoint:

- Postman (import the collection in `postman/airdigone-upload.postman_collection.json`)
- curl (command-line)

Prerequisites
- Server running (default in this repo: http://localhost:5000)
- A valid access token (get from login/verify OTP flow). The token must be an access token containing the user's id (and preferably role) or the server must be able to fetch the role from DB.

Postman
1. Import the file `postman/airdigone-upload.postman_collection.json` into Postman.
2. Set two environment variables: `baseUrl` (e.g. `http://localhost:5000`) and `token` (your Bearer token).
3. Open the request "Save Profile (upload)", choose a file for the `profile_picture` form field, then Send.

curl example

Replace <TOKEN> and /absolute/path/to/photo.jpg with real values.

```bash
curl -X POST "http://localhost:5000/api/v1/jobs/save-profile" \
  -H "Authorization: Bearer <TOKEN>" \
  -F "full_name=Jane Doe" \
  -F "birthdate=1990-01-01" \
  -F "gender=female" \
  -F "disability=" \
  -F "interests[]=tech" \
  -F "interests[]=design" \
  -F "profile_picture=@/absolute/path/to/photo.jpg"
```

Notes
- The endpoint accepts multipart/form-data. The file field name is `profile_picture`.
- The server will respond with JSON and include `profile_picture` (a relative URL) when the upload succeeds.
- If your frontend needs a fully qualified URL, prepend your server origin (e.g. http://localhost:5000) to the returned `profile_picture` path.
- Max file size is 5MB and only image/* MIME types are accepted by the current multer configuration.

Troubleshooting
- If you get 401/403, verify your token and that the user has the `user` role (or the middleware can fetch the role).
- If you get a Multer error or "Only image files are allowed", make sure the file is an image and within the size limit.

const { app, request, registerUser } = require('./setup');

describe('Auth API', () => {
  let registeredEmail;
  let userToken;

  it('should register a new user successfully', async () => {
    registeredEmail = `auth-test-${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: registeredEmail, password: 'password123', name: '測試用戶' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('id');
    expect(res.body.data.user).toHaveProperty('email', registeredEmail);
    expect(res.body.data.user).toHaveProperty('role', 'user');

    userToken = res.body.data.token;
  });

  it('should fail to register with duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: registeredEmail, password: 'password123', name: '重複用戶' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should login successfully', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@hexschool.com', password: '12345678' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('email', 'admin@hexschool.com');
  });

  it('should fail login with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@hexschool.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get profile with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('email', registeredEmail);
    expect(res.body.data).toHaveProperty('name');
    expect(res.body.data).toHaveProperty('role');
  });

  it('should fail to get profile without token', async () => {
    const res = await request(app)
      .get('/api/auth/profile');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should reject non-string credentials', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: registeredEmail, password: 12345678 });

    expect(loginRes.status).toBe(400);
    expect(loginRes.body).toHaveProperty('data', null);
    expect(loginRes.body).toHaveProperty('error', 'VALIDATION_ERROR');

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: `number-${Date.now()}@example.com`, password: 12345678, name: '測試' });

    expect(registerRes.status).toBe(400);
    expect(registerRes.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should return VALIDATION_ERROR for a malformed JSON body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      data: null,
      error: 'VALIDATION_ERROR',
      message: '請求格式錯誤'
    });
    vi.restoreAllMocks();
  });
});

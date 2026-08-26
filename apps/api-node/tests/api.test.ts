import request from 'supertest';
import app from '../src/app';

describe('API Foundation', () => {
  it('GET /api/health should return ok and a requestId', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.requestId).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });
});

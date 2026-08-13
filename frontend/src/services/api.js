import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export async function uploadImage(file, { idempotencyKey } = {}) {
  const form = new FormData();
  form.append('image', file);
  const headers = { 'Content-Type': 'multipart/form-data' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const { data } = await client.post('/images', form, { headers });
  return data;
}

export async function uploadBatch(files) {
  const form = new FormData();
  files.forEach((file) => form.append('images', file));
  const { data } = await client.post('/images/batch', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getStatus(processingId) {
  const { data } = await client.get(`/images/${processingId}/status`);
  return data;
}

export async function getResults(processingId) {
  const { data } = await client.get(`/images/${processingId}/results`);
  return data;
}

export async function getError(processingId) {
  const { data } = await client.get(`/images/${processingId}/error`);
  return data;
}

export async function retryImage(processingId) {
  const { data } = await client.post(`/images/${processingId}/retry`);
  return data;
}

export default { uploadImage, uploadBatch, getStatus, getResults, getError, retryImage };

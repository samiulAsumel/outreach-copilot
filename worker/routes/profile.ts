import type { Env } from '../types';
import { jsonOk, noContent, badRequest, notFound } from '../lib/http';
import { getProfile, saveProfile, setCvFile, getCvFile, clearCvFile } from '../lib/db';

// D1's max row/BLOB size is 2,000,000 bytes (2 MB) — capped well under that
// (a text-based CV PDF is normally 50-300 KB; this leaves headroom for the
// rest of the row plus D1's own overhead without getting close to the wall).
const MAX_CV_BYTES = 1.5 * 1024 * 1024;
const ALLOWED_CV_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function handleGetProfile(env: Env): Promise<Response> {
  const profile = await getProfile(env);
  // No row yet is a normal, expected state (first run) — not a 404. The
  // dashboard renders an empty editor for it.
  return jsonOk(
    profile ?? {
      id: 1,
      content_text: '',
      portfolio_link: null,
      cv_file_name: null,
      cv_file_uploaded_at: null,
      updated_at: null,
    }
  );
}

export async function handlePutProfile(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ content_text?: unknown; portfolio_link?: unknown }>().catch(() => null);
  if (!body || typeof body.content_text !== 'string') {
    throw badRequest('content_text (string) is required', ['content_text']);
  }
  const portfolioLink =
    typeof body.portfolio_link === 'string' && body.portfolio_link.trim() ? body.portfolio_link.trim() : null;
  if (portfolioLink) {
    try {
      new URL(portfolioLink);
    } catch {
      throw badRequest('portfolio_link must be a valid absolute URL', ['portfolio_link']);
    }
  }
  const saved = await saveProfile(env, body.content_text, portfolioLink);
  return jsonOk(saved, 'Resume profile saved');
}

export async function handleUploadCv(request: Request, env: Env): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || !(file instanceof File)) {
    throw badRequest('multipart/form-data with a "file" field is required', ['file']);
  }
  if (file.size === 0) {
    throw badRequest('Uploaded file is empty', ['file']);
  }
  if (file.size > MAX_CV_BYTES) {
    throw badRequest(`File too large — max ${Math.round(MAX_CV_BYTES / 1024)} KB`, ['file']);
  }
  if (!ALLOWED_CV_TYPES.has(file.type)) {
    throw badRequest('File must be a PDF or Word document (.pdf, .doc, .docx)', ['file']);
  }

  const data = await file.arrayBuffer();
  const saved = await setCvFile(env, file.name, file.type, data);
  return jsonOk(saved, 'CV uploaded');
}

export async function handleDownloadCv(env: Env): Promise<Response> {
  const cv = await getCvFile(env);
  if (!cv) {
    throw notFound('CV file');
  }
  return new Response(cv.data, {
    headers: {
      'Content-Type': cv.contentType,
      'Content-Disposition': `attachment; filename="${cv.fileName.replace(/"/g, '')}"`,
    },
  });
}

export async function handleDeleteCv(env: Env): Promise<Response> {
  const profile = await getProfile(env);
  if (!profile?.cv_file_name) {
    throw notFound('CV file');
  }
  await clearCvFile(env);
  return noContent();
}

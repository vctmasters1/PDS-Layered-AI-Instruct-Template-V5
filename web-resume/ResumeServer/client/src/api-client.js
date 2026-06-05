const TOKEN_KEY = 'rs_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    return;
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Request failed.');
  return json.data;
}

export async function uploadFile(path, file) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    return;
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'Upload failed.');
  return json.data;
}

export const api = {
  auth: {
    login: (username, password) => request('POST', '/auth/login', { username, password }),
    register: (username, password, fullName, adminSecret) =>
      request('POST', '/auth/register', { username, password, fullName, adminSecret }),
  },
  listings: {
    list: ()             => request('GET',    '/listings'),
    get: (id)            => request('GET',    `/listings/${id}`),
    create: (title, content) => request('POST', '/listings', { title, content }),
    delete: (id)         => request('DELETE', `/listings/${id}`),
  },
  parts: {
    list: ()             => request('GET',    '/parts'),
    upload: (file)       => uploadFile('/parts', file),
    getContent: (filename)         => request('GET',  `/parts/${encodeURIComponent(filename)}`).then((d) => d.content),
    updateContent: (filename, content) => request('PUT', `/parts/${encodeURIComponent(filename)}`, { content }),
    delete: (filename)   => request('DELETE', `/parts/${encodeURIComponent(filename)}`),
  },
  workflow: {
    status: (listingId)          => request('GET',  `/workflow/${listingId}/status`),
    trigger: (listingId, step)   => request('POST', `/workflow/${listingId}/${step}`),
    jobStatus: (listingId, jobId)=> request('GET',  `/workflow/${listingId}/jobs/${jobId}`),
    runAll: (listingId)          => request('POST', `/workflow/${listingId}/run-all`),
  },
  files: {
    url: (listingId, filename) => `/api/files/${listingId}/${encodeURIComponent(filename)}`,
  },
  admin: {
    users: ()                            => request('GET', '/admin/users'),
    createUser: (username, password, fullName, role) =>
      request('POST', '/admin/users', { username, password, fullName, role }),
    setRole: (userId, role)              => request('POST', `/admin/users/${userId}/role`, { role }),
    setResumeAccess: (userId, access)    => request('POST', `/admin/users/${userId}/resume-access`, { access }),
    getLlmSettings: ()                   => request('GET', '/admin/settings/llm'),
    saveLlmSettings: (data)              => request('POST', '/admin/settings/llm', data),
  },
  extension: {
    downloadUrl: () => '/api/extension/download',
  },
  insight: {
    query: (message) => request('POST', '/insight/query', { message }).then((d) => d.content),
  },
  aichat: {
    send: (messages) => request('POST', '/aichat/message', { messages }).then((d) => d.content),
  },
  sources: {
    list: ()                      => request('GET',    '/sources'),
    upload: (file)                => uploadFile('/sources', file),
    getContent: (filename)        => request('GET',  `/sources/${encodeURIComponent(filename)}`).then((d) => d.content),
    updateContent: (filename, content) => request('PUT', `/sources/${encodeURIComponent(filename)}`, { content }),
    delete: (filename)            => request('DELETE', `/sources/${encodeURIComponent(filename)}`),
    buildParts: ()                => request('POST', '/sources/build-parts'),
    buildPartsStatus: (jobId)     => request('GET',  `/sources/build-parts/status/${jobId}`),
    manifest: ()                  => request('GET',  '/sources/parts-manifest'),
    other: {
      list: ()                    => request('GET',    '/sources/other'),
      upload: (file)              => uploadFile('/sources/other', file),
      delete: (filename)          => request('DELETE', `/sources/other/${encodeURIComponent(filename)}`),
    },
    analyzeSkills: ()             => request('POST', '/sources/analyze-skills'),
    analyzeSkillsStatus: (jobId)  => request('GET',  `/sources/analyze-skills/status/${jobId}`),
    getSkillsAnalysis: ()         => request('GET',  '/sources/skills-analysis').then((d) => d.content),
    updateSkillsAnalysis: (content) => request('PUT', '/sources/skills-analysis', { content }),
    template: {
      list: ()               => request('GET',    '/sources/template'),
      upload: (file)         => uploadFile('/sources/template', file),
      delete: (filename)     => request('DELETE', `/sources/template/${encodeURIComponent(filename)}`),
      analyze: ()            => request('POST',   '/sources/template/analyze'),
      analyzeStatus: (jobId) => request('GET',    `/sources/template/analyze/status/${jobId}`),
      getNotes: ()           => request('GET',    '/sources/template/notes').then((d) => d.content),
      updateNotes: (content) => request('PUT',    '/sources/template/notes', { content }),
    },
  },
};

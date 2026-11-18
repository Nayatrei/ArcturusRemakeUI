import { localFilesOnly, localViewUrl, sourceUrl } from './data-source.js';

let serial = 0;

function drawEntries(panel, entries) {
  panel.querySelector('summary').textContent = entries.length ? `피드백 ${entries.length}건 · 의견 남기기` : '피드백 남기기';
  const list = panel.querySelector('ol');
  list.replaceChildren();
  for (const entry of entries) {
    const li = document.createElement('li');
    const time = document.createElement('time');
    time.dateTime = entry.savedAt;
    time.textContent = new Date(entry.savedAt).toLocaleString('ko-KR', {dateStyle: 'short', timeStyle: 'short'});
    const message = document.createElement('p');
    message.textContent = entry.message;
    li.append(time, message);
    list.append(li);
  }
  list.hidden = !entries.length;
}

export function attachModelFeedback(container, work) {
  if (!work.modelReviewRevision) return;
  const panel = document.createElement('details');
  panel.className = 'model-feedback';
  panel.dataset.work = work.id;
  const summary = document.createElement('summary');
  const list = document.createElement('ol');
  panel.append(summary, list);
  container.append(panel);
  if (localFilesOnly) {
    summary.textContent = '모델 피드백';
    const link = document.createElement('a');
    link.href = localViewUrl(location.href);
    link.textContent = 'PC 자료함에서 피드백 보기·남기기';
    panel.append(link);
    return;
  }
  drawEntries(panel, work.modelFeedback || []);
  const form = document.createElement('form');
  form.method = 'post';
  form.action = sourceUrl('/api/model-feedback');
  const label = document.createElement('label');
  const input = document.createElement('textarea');
  input.id = 'model-feedback-' + (++serial);
  input.name = 'message';
  input.rows = 2;
  input.required = true;
  input.maxLength = 800;
  label.htmlFor = input.id;
  label.id = input.id + '-label';
  label.textContent = work.title + ' · 검토 의견';
  form.setAttribute('aria-labelledby', label.id);
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = '의견 등록';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.id = input.id + '-status';
  input.setAttribute('aria-describedby', status.id);
  input.addEventListener('invalid', () => input.setAttribute('aria-invalid', 'true'));
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
  });
  form.append(label, input, button, status);
  panel.append(form);
  let pending;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const message = input.value.trim();
    if (!message) {
      input.setCustomValidity('의견을 입력해 주세요.');
      input.reportValidity();
      return;
    }
    if (pending?.message !== message) pending = {requestId: crypto.randomUUID(), message};
    button.disabled = true;
    input.readOnly = true;
    status.textContent = '의견을 등록하고 있습니다.';
    try {
      const response = await fetch(form.action, {
        method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({workId: work.id, revision: work.modelReviewRevision, ...pending}), signal: AbortSignal.timeout(15000)
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || '등록하지 못했습니다. 다시 시도해 주세요.');
      work.modelFeedback = result.entries;
      for (const other of document.querySelectorAll('details.model-feedback')) {
        if (other.dataset.work === work.id) drawEntries(other, result.entries);
      }
      input.value = '';
      pending = undefined;
      status.textContent = '피드백을 저장했습니다.';
    } catch (error) {
      status.textContent = error.message || '연결을 확인하고 다시 시도해 주세요.';
    } finally {
      input.readOnly = false;
      button.disabled = false;
    }
  });
}

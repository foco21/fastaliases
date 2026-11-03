const $ = id => document.getElementById(id);
const status = (text, kind = '') => { $('status').className = 'status ' + kind; $('status').textContent = text; };

// The saved token is never sent back to this page; we only show whether one exists.
async function showSaved() {
  const { has } = await send({ type: 'hasToken' });
  $('token').placeholder = has ? 'Token saved. Paste a new one to replace it.' : 'fmu1-…';
  $('remove').hidden = !has;
}

$('save').onclick = async () => {
  const token = $('token').value.trim();
  if (!token) return status('Paste a token first.', 'err');
  try {
    await send({ type: 'saveToken', token });
    $('token').value = '';
    status('Saved.', 'ok');
    showSaved();
  } catch (e) { status(errorText(e), 'err'); }
};

$('remove').onclick = async () => {
  await send({ type: 'saveToken', token: '' }).catch(() => {});
  status('Token removed.', 'ok');
  showSaved();
};

$('test').onclick = async () => {
  $('test').disabled = true;
  status('Testing…', 'muted');
  try {
    // Tests the pasted token if there is one, otherwise the saved one.
    const { count } = await send({ type: 'test', token: $('token').value.trim() });
    status(`Connected. Found ${count} alias${count === 1 ? '' : 'es'}.`, 'ok');
  } catch (e) { status(errorText(e), 'err'); }
  $('test').disabled = false;
};

showSaved().catch(e => status(errorText(e), 'err'));

chrome.storage.local.get('debug').then(({ debug }) => { $('debug').checked = !!debug; });
$('debug').onchange = () => chrome.storage.local.set({ debug: $('debug').checked });

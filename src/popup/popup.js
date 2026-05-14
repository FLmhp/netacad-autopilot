import browser from 'webextension-polyfill';

const startButton = document.querySelector('#start-auto-flow');
const status = document.querySelector('#status');
let statusTimer = null;

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.dataset.error = isError ? 'true' : 'false';
};

const setRunningState = isRunning => {
  startButton.disabled = isRunning;
  startButton.textContent = isRunning ? 'Running...' : 'Start';
};

const getActiveTab = async () => {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    throw new Error('No active tab');
  }

  return tab;
};

const refreshStatus = async () => {
  try {
    const tab = await getActiveTab();
    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'getAutoFlowStatus'
    });

    if (!response) {
      throw new Error('No status response');
    }

    setStatus(response.status);
    setRunningState(response.enabled);
  } catch (e) {
    setStatus('Open a NetAcad assessment page first.', true);
    setRunningState(false);
  }
};

startButton?.addEventListener('click', async () => {
  setStatus('Starting...');
  setRunningState(true);

  try {
    const tab = await getActiveTab();
    const response = await browser.tabs.sendMessage(tab.id, {
      action: 'startAutoFlow'
    });

    if (!response) {
      throw new Error('Automation did not start');
    }

    setStatus(response.status);
    setRunningState(response.enabled);
  } catch (e) {
    setStatus('Open a NetAcad assessment page first.', true);
    setRunningState(false);
  }
});

refreshStatus();
statusTimer = window.setInterval(refreshStatus, 1000);
window.addEventListener('beforeunload', () => {
  if (statusTimer) {
    window.clearInterval(statusTimer);
  }
});

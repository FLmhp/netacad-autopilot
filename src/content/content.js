import browser from 'webextension-polyfill';
import {deepHtmlSearch, deepHtmlFindByTextContent} from "./domHelper";

const AUTO_START_DELAY_MS = 1000;
const AUTO_MANUAL_TRIGGER_DELAY_MS = 300;
const AUTO_FLOW_INTERVAL_MS = 1000;
const AUTO_SUBMIT_RETRY_MS = 4000;
const AUTO_ANSWER_SETTLE_MS = 1000;

let isSuspendRunning = false;
const components = [];
let questions = [];
const componentUrls = [];
let isAutoFlowEnabled = false;
let autoStartReadyAt = 0;
let autoFlowPromise = null;
let lastAutoAttempt = {
  signature: '',
  at: 0
};
let lastAutoFinalSubmitAt = 0;
let isAutoFinalSubmitPending = false;
let autoFlowStatus = 'Idle';
let pendingAutoSubmit = {
  signature: '',
  answeredAt: 0
};

const processedQuestionElements = new WeakSet();
const processedLabels = new WeakSet();
const processedMatchPairs = new WeakSet();
const processedDropdownOptions = new WeakSet();
const processedYesNoContainers = new WeakSet();
const processedOpenTextQuestions = new WeakSet();
const processedFillBlankDivs = new WeakSet();
const processedTableRows = new WeakSet();
const processedOpenTextButtons = new WeakSet();
const processedTableOptions = new WeakSet();
const processedFillBlankOptions = new WeakSet();

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const normalizeText = text => (text || '').replace(/\s+/g, ' ').trim();
const getAutoFlowState = () => ({
  enabled: isAutoFlowEnabled,
  status: autoFlowStatus
});
const setAutoFlowStatus = status => {
  autoFlowStatus = status;
};
const resetPendingAutoSubmit = () => {
  pendingAutoSubmit = {
    signature: '',
    answeredAt: 0
  };
};
const resetAutoFinalSubmitState = () => {
  lastAutoFinalSubmitAt = 0;
  isAutoFinalSubmitPending = false;
};
const resetAutoFlowProgress = () => {
  autoStartReadyAt = 0;
  lastAutoAttempt = {
   signature: '',
   at: 0
  };
  resetPendingAutoSubmit();
  resetAutoFinalSubmitState();
};
const completeAutoFlow = (status = 'Completed. Automation stopped.') => {
  isAutoFlowEnabled = false;
  resetAutoFlowProgress();
  setAutoFlowStatus(status);
};
const activateAutoFlow = (status, delayMs = AUTO_START_DELAY_MS) => {
  isAutoFlowEnabled = true;
  resetAutoFlowProgress();
  autoStartReadyAt = Date.now() + delayMs;
  setAutoFlowStatus(status);
};
const startAutoFlow = () => {
  if (isAutoFlowEnabled) {
   return getAutoFlowState();
  }

  activateAutoFlow('Waiting 1 second before starting...');
  return getAutoFlowState();
};
const armAutoSubmitFromManualSolve = () => {
  activateAutoFlow('Manual solve detected. Auto submit armed.', AUTO_MANUAL_TRIGGER_DELAY_MS);
};

browser.runtime.onMessage.addListener(async (request) => {
  if (request?.componentsUrl && typeof request.componentsUrl === 'string' && !componentUrls.includes(request.componentsUrl)) {
    componentUrls.push(request.componentsUrl);
    await setComponents(request.componentsUrl);
    suspendMain();
    return;
  }

  if (request?.action === 'startAutoFlow') {
    return startAutoFlow();
  }

  if (request?.action === 'getAutoFlowStatus') {
    return getAutoFlowState();
  }
});

const setComponents = async url => {
  const getTextContentOfText = htmlString => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    return doc.body.textContent;
  };

  try {
    const res = await fetch(url);

    if (!res.ok)
      return;

    let json = await res.json();
    json = json
      .filter(component => component._items)
      .filter(component => !components.map(c => c._id).includes(component._id))
      .map(component => {
        component.body = getTextContentOfText(component.body);
        return component;
      });

    components.push(...json);
  } catch (e) {
    console.error(e);
  }
};

const setQuestionSections = async () => {
  let isAtLeaseOneSet = false;

  for (const component of components) {
    const questionDiv = deepHtmlSearch(document, `.${CSS.escape(component._id)}`);

    if (questionDiv) {
      isAtLeaseOneSet = true;
      let questionType = 'basic';

      if (component._items[0].text && component._items[0]._options) {
        questionType = 'dropdownSelect';
      } else if (component._items[0].question && component._items[0].answer) {
        questionType = 'match';
      } else if (component._items[0]._graphic?.alt && component._items[0]._graphic?.src) {
        questionType = 'yesNo';
      } else if (component._items[0].id && component._items[0]._options?.text) {
        questionType = 'openTextInput';
      } else if (component._items[0].preText && component._items[0].postText && component._items[0]._options?.[0]?.text) {
        questionType = 'fillBlanks';
      } else if (component._items[0]._options?.[0].text && typeof component._items[0]._options?.[0]._isCorrect === 'boolean') {
        questionType = 'tableDropdown';
      }

      questions.push({
        questionDiv,
        id: component._id,
        answersLength: component._items.length,
        questionType,
        items: component._items
      });
    }
  }

  if (!isAtLeaseOneSet) {
    await new Promise(resolve => setTimeout(resolve, AUTO_FLOW_INTERVAL_MS));
    return await setQuestionSections();
  }
};

const findFallbackQuestionElement = document => {
  return deepHtmlSearch(document, '.component__body')
    || deepHtmlSearch(document, '.component__body-inner')
    || deepHtmlSearch(document, '.component__container')
    || deepHtmlSearch(document, '[sgpulse-type="component"]')
    || deepHtmlSearch(document, 'mcq-view')
    || (typeof document?.click === 'function' ? document : null);
};

const findQuestionElement = document => {
  for (const component of components) {
    const questionElement = deepHtmlFindByTextContent(document, component.body);

    if (questionElement) {
      return questionElement;
    }
  }

  return findFallbackQuestionElement(document);
};

const findAnswerInputsBasic = (document, questionId, answersLength, inputs = []) => {
  for (let i = 0; i < answersLength; i++) {
    const input = deepHtmlSearch(document, `#${CSS.escape(questionId)}-${i}-input`)
      || deepHtmlSearch(document, `[id$="-${i}-input"]`);
    const label = deepHtmlSearch(document, `#${CSS.escape(questionId)}-${i}-label`)
      || deepHtmlSearch(document, `[id$="-${i}-label"]`)
      || deepHtmlSearch(document, `[for$="-${i}-input"]`);

    if (input) {
      inputs.push({input, label});

      if (inputs.length === answersLength) {
        return inputs;
      }
    }
  }
};

const findAnswerInputsMatch = (document, answersLength, buttons = []) => {
  for (let i = 0; i < answersLength; i++) {
    const answerInputs = deepHtmlSearch(document, `[data-id="${i}"]`, false, 2);

    if (answerInputs) {
      buttons.push(answerInputs);

      if (buttons.length === answersLength) {
        return buttons;
      }
    }
  }
};

const setQuestionElements = () => {
  questions.map(question => {
    if (question.questionType === 'basic') {
      question.questionElement = findQuestionElement(question.questionDiv);
      question.inputs = findAnswerInputsBasic(question.questionDiv, question.id, question.answersLength) || [];
    } else if (question.questionType === 'match') {
      question.questionElement = findQuestionElement(question.questionDiv);
      question.inputs = findAnswerInputsMatch(question.questionDiv, question.answersLength) || [];
    } else if (question.questionType === 'dropdownSelect') {
      setDropdownSelectQuestions(question);
      question.skip = true;
    } else if (question.questionType === 'yesNo') {
      // yes - no questions are dynamic - they use the same elements but changes attributes
      initYeNoQuestions(question);
      question.skip = true;
    } else if (question.questionType === 'openTextInput') {
      // buttons are static but questions are moving around
      setOpenTextInputQuestions(question);
      question.skip = true;
    } else if (question.questionType === 'fillBlanks') {
      setFillBlanksQuestions(question);
      question.skip = true;
    } else if (question.questionType === 'tableDropdown') {
      // when there is no description in the table down only mouseover works
      setTableDropdownQuestions(question);
      question.skip = true;
    }

    return question;
  });
};

const setDropdownSelectQuestions = question => {
  question.items.forEach((item, i) => {
    const questionDiv = deepHtmlSearch(question.questionDiv, `[index="${i}"]`, true);
    const questionElement = deepHtmlFindByTextContent(questionDiv, item.text.trim());

    for (const [index, option] of item._options.entries()) {
      if (option._isCorrect) {
        const optionElement = deepHtmlSearch(questionDiv, `#dropdown__item-index-${index}`, true);

        questions.push({
          id: question.id,
          questionDiv,
          questionElement,
          inputs: [optionElement],
          questionType: question.questionType
        });
        return;
      }
    }
  });
};

const initYeNoQuestions = question => {
  if (processedYesNoContainers.has(question.questionDiv))
    return;
  processedYesNoContainers.add(question.questionDiv);

  const questionElement = deepHtmlSearch(question.questionDiv, `.img_question`);

  if (!questionElement)
    return;

  questionElement.parentElement?.addEventListener('click', e => {
    const questionElement = deepHtmlSearch(e.target, `.img_question`);

    for (const item of question.items) {
      if (questionElement.alt === item._graphic.alt) {
        if (e.isTrusted) {
          armAutoSubmitFromManualSolve();
        }
        if (item._shouldBeSelected) {
          const yesButton = deepHtmlSearch(question.questionDiv, `.user_selects_yes`);
          yesButton.click();
        } else {
          const noButton = deepHtmlSearch(question.questionDiv, `.user_selects_no`);
          noButton.click();
        }
      }
    }
  });

  const yesButton = deepHtmlSearch(question.questionDiv, `.user_selects_yes`);
  const noButton = deepHtmlSearch(question.questionDiv, `.user_selects_no`);

  yesButton?.addEventListener('mouseover', e => {
    if (e.isTrusted && e.ctrlKey) {
      armAutoSubmitFromManualSolve();
      const questionElement = deepHtmlSearch(question.questionDiv, `.img_question`);

      if (questionElement) {
        for (const item of question.items) {
          if (item._graphic.alt === questionElement.alt) {
            if (item._shouldBeSelected) {
              yesButton.click();
            }
            break;
          }
        }
      }
    }
  });

  noButton?.addEventListener('mouseover', e => {
    if (e.isTrusted && e.ctrlKey) {
      armAutoSubmitFromManualSolve();
      const questionElement = deepHtmlSearch(question.questionDiv, `.img_question`);

      if (questionElement) {
        for (const item of question.items) {
          if (item._graphic.alt === questionElement.alt) {
            if (!item._shouldBeSelected) {
              noButton.click();
            }
            break;
          }
        }
      }
    }
  });
};

const setOpenTextInputQuestions = question => {
  question.items.forEach((item, i) => {
    const questionElement = deepHtmlSearch(question.questionDiv, '#' + CSS.escape(`${question.id}-option-${i}`));
    const button = deepHtmlSearch(question.questionDiv, `.current-item-${i}`, true);

    if (questionElement && !processedOpenTextQuestions.has(questionElement)) {
      processedOpenTextQuestions.add(questionElement);

      questionElement.addEventListener('click', e => {
        if (e.isTrusted) {
          armAutoSubmitFromManualSolve();
        }
        setTimeout(() => {
          button.click();
          const currentQuestion = questionElement.textContent?.trim();
          const position = question.items.find(item => item._options.text.trim() === currentQuestion)?.position?.[0];

          if (position) {
            setTimeout(() => {
              const input = deepHtmlSearch(question.questionDiv, `[data-target="${position}"]`);
              if (input) {
                input?.click();
              } else {
                question.questionDiv.click();
              }
            }, 100);
          }
        }, 100);
      });
    }

    if (button && !processedOpenTextButtons.has(button)) {
      processedOpenTextButtons.add(button);

      button.addEventListener('click', () => {
        setTimeout(() => {
          const currentQuestion = questionElement?.textContent?.trim();
          const position = question.items.find(item => item._options.text.trim() === currentQuestion)?.position?.[0];

          if (position) {
            setTimeout(() => {
              const input = deepHtmlSearch(question.questionDiv, `[data-target="${position}"]`);

              if (input && !input.dataset.hoverListenerAdded) {
                input.dataset.hoverListenerAdded = 'true';

                input.addEventListener('mouseover', e => {
                  if (e.isTrusted && e.ctrlKey) {
                    armAutoSubmitFromManualSolve();
                    input.click();
                  }
                });
              }
            }, 100);
          }
        }, 100);
      });
    }
  });
};

const setFillBlanksQuestions = question => {
  const questionDivs = [...deepHtmlSearch(question.questionDiv, '.fillblanks__item', true, question.answersLength)];

  questionDivs.forEach(questionDiv => {
    if (processedFillBlankDivs.has(questionDiv))
      return;
    processedFillBlankDivs.add(questionDiv);

    const textContent = questionDiv.textContent.trim();

    for (const item of question.items) {
      if (textContent.startsWith(removeTagsFromString(item.preText)) && textContent.endsWith(removeTagsFromString(item.postText))) {
        for (const option of item._options) {
          if (option._isCorrect) {
            const dropdownItems = [...deepHtmlSearch(questionDiv, '.dropdown__item', true, item._options.length)];

            for (const dropdownItem of dropdownItems) {
              if (processedFillBlankOptions.has(dropdownItem))
                break;
              processedFillBlankOptions.add(dropdownItem);

              if (dropdownItem.textContent.trim() === option.text.trim()) {
                questionDiv.addEventListener('click', (e) => {
                  if (!e.target.textContent?.trim())
                    return;
                  if (e.isTrusted) {
                    armAutoSubmitFromManualSolve();
                  }
                  dropdownItem.click();
                });

                dropdownItem.addEventListener('mouseover', e => {
                  if (e.isTrusted && e.ctrlKey) {
                    armAutoSubmitFromManualSolve();
                    dropdownItem.click();
                  }
                });
                break;
              }
            }
            break;
          }
        }
        break;
      }
    }
  });
};

const setTableDropdownQuestions = question => {
  const sectionDivs = Array.from(deepHtmlSearch(question.questionDiv, 'tbody tr', true, question.answersLength));

  sectionDivs.forEach((section, i) => {
    if (processedTableRows.has(section))
      return;
    processedTableRows.add(section);

    const optionElements = Array.from(deepHtmlSearch(section, '[role="option"]', true, question.items[i]._options.length));
    const correctOption = question.items[i]._options.find(option => option._isCorrect);

    for (const optionElement of optionElements) {
      if (processedTableOptions.has(optionElement))
        break;
      processedTableOptions.add(optionElement);

      if (optionElement.textContent.trim() === correctOption.text.trim()) {
        section.addEventListener('click', e => {
          if (e.isTrusted) {
            armAutoSubmitFromManualSolve();
          }
          optionElement.click();
        });

        optionElement.addEventListener('mouseover', e => {
          if (e.isTrusted && e.ctrlKey) {
            armAutoSubmitFromManualSolve();
            optionElement.click();
          }
        });
        break;
      }
    }
  });
};

const deepHtmlQueryAll = (document, selector, results = []) => {
  if (!document?.querySelectorAll)
    return results;

  results.push(...document.querySelectorAll(selector));

  const iframes = document.querySelectorAll('iframe');
  for (const iframe of iframes) {
    deepHtmlQueryAll(iframe.contentDocument, selector, results);
  }

  const shadowHosts = [...document.querySelectorAll('*')].filter(el => el.shadowRoot);
  for (const host of shadowHosts) {
    deepHtmlQueryAll(host.shadowRoot, selector, results);
  }

  return results;
};

const findClickableAnswerElement = (questionDiv, text) => {
  const normalizedTarget = normalizeText(text);

  if (!normalizedTarget)
    return null;

  const candidates = deepHtmlQueryAll(questionDiv, 'label, button, [role="option"], [role="radio"], [role="checkbox"], [class*="option"], [class*="item"]');
  const target = candidates.find(candidate => {
    const candidateText = normalizeText(candidate.textContent);

    if (!candidateText)
      return false;

    return candidateText === normalizedTarget
      || candidateText.includes(normalizedTarget)
      || normalizedTarget.includes(candidateText);
  });

  if (!target)
    return null;

  return target;
};

const selectBasicAnswers = question => {
  const component = components.find(c => c._id === question.id);

  if (!component)
    return;

  let usedStructuredInputs = false;

  question.inputs.forEach(({input, label}, i) => {
    if (!input || !label)
      return;

    usedStructuredInputs = true;

    if (input.checked) {
      label.click();
    }

    if (component._items[i]._shouldBeSelected) {
      setTimeout(() => label.click(), 10);
    }
  });

  if (usedStructuredInputs)
    return;

  component._items.forEach(item => {
    if (!item._shouldBeSelected)
      return;

    const optionText = normalizeText(removeTagsFromString(item.text || item.body || ''));
    const optionElement = findClickableAnswerElement(question.questionDiv, optionText);
    optionElement?.click();
  });
};

const selectMatchAnswers = question => {
  if (question.inputs.length > 0) {
    question.inputs.forEach(input => {
      if (input[0] && input[1]) {
        input[0].click();
        input[1].click();
      }
    });
    return;
  }

  const matchingTitles = deepHtmlQueryAll(question.questionDiv, '.matching__item-title');
  matchingTitles.forEach(title => title.click());
};

const initClickListeners = () => {
  questions.forEach((question) => {
    if (question.skip || !question.questionElement)
      return;

    if (processedQuestionElements.has(question.questionElement))
      return;
    processedQuestionElements.add(question.questionElement);

    question.questionElement.addEventListener('click', e => {
      if (e.isTrusted) {
        armAutoSubmitFromManualSolve();
      }
      if (question.questionType === 'basic') {
        selectBasicAnswers(question);
      } else if (question.questionType === 'match') {
        selectMatchAnswers(question);
      } else if (question.questionType === 'dropdownSelect') {
        question.inputs[0]?.click();
      }
    });
  });
};

const initHoverListeners = () => {
  questions.forEach((question) => {
    if (question.skip)
      return;

    const component = components.find(c => c._id === question.id);

    if (question.questionType === 'basic') {
      question.inputs.forEach(({input, label}, i) => {
        if (!label || processedLabels.has(label))
          return;
        processedLabels.add(label);

        label.addEventListener('mouseover', e => {
          if (e.isTrusted && e.ctrlKey) {
            armAutoSubmitFromManualSolve();
            if (input.checked) {
              label.click();
            }

            if (component._items[i]._shouldBeSelected) {
              setTimeout(() => label.click(), 10);
            }
          }
        });
      });
    } else if (question.questionType === 'match') {
      if (question.inputs.length > 0) {
        question.inputs.forEach(input => {
          if (!input[0] || processedMatchPairs.has(input[0]))
            return;
          processedMatchPairs.add(input[0]);

          input[0].addEventListener('mouseover', e => {
            if (e.isTrusted && e.ctrlKey) {
              armAutoSubmitFromManualSolve();
              input[0].click();
              input[1].click();
            }
          });
        });
      } else {
        const matchingTitles = deepHtmlQueryAll(question.questionDiv, '.matching__item-title');

        matchingTitles.forEach(title => {
          if (processedMatchPairs.has(title))
            return;
          processedMatchPairs.add(title);

          title.addEventListener('mouseover', e => {
            if (e.isTrusted && e.ctrlKey) {
              armAutoSubmitFromManualSolve();
              title.click();
            }
          });
        });
      }
    } else if (question.questionType === 'dropdownSelect') {
      const optionEl = question.inputs[0];

      if (!optionEl || processedDropdownOptions.has(optionEl))
        return;
      processedDropdownOptions.add(optionEl);

      optionEl.addEventListener('mouseover', e => {
        if (e.isTrusted && e.ctrlKey) {
          armAutoSubmitFromManualSolve();
          optionEl.click();
        }
      });
    }
  });
};

const removeTagsFromString = string => string.replace(/<[^>]*>?/gm, '').trim();

const setIsReady = () => {
  for (const component of components) {
    const questionDiv = deepHtmlSearch(document, `.${CSS.escape(component._id)}`);

    if (questionDiv)
      return true;
  }

  return false;
};

const getVisibleQuestionSignature = () => components
  .filter(component => deepHtmlSearch(document, `.${CSS.escape(component._id)}`))
  .map(component => component._id)
  .join('|');

const getAutoSubmitButton = () => deepHtmlSearch(document, '.submit-button');
const getAutoFinalConfirm = () => deepHtmlSearch(document, '#confirm-exam');
const getAutoFinalSubmitButton = () => deepHtmlSearch(document, '.adaptive-assessment-submit');
const isSubmitButtonReady = button => Boolean(button) && !button.disabled && !button.classList.contains('is-disabled');

const autoAnswerSkipQuestion = question => {
  if (question.questionType === 'yesNo') {
    const questionElements = [...question.questionDiv.querySelectorAll('.img_question')];

    questionElements.forEach(questionElement => {
      questionElement.parentElement?.click();
    });
  } else if (question.questionType === 'openTextInput') {
    question.items.forEach((item, index) => {
      const questionElement = deepHtmlSearch(question.questionDiv, '#' + CSS.escape(`${question.id}-option-${index}`));
      questionElement?.click();
    });
  } else if (question.questionType === 'fillBlanks') {
    const questionDivs = [...question.questionDiv.querySelectorAll('.fillblanks__item')];
    questionDivs.forEach(questionDiv => questionDiv.click());
  } else if (question.questionType === 'tableDropdown') {
    const rows = [...question.questionDiv.querySelectorAll('tbody tr')];
    rows.forEach(row => row.click());
  }
};

const autoAnswerQuestions = async () => {
  for (const question of questions) {
    if (question.skip) {
      autoAnswerSkipQuestion(question);
      continue;
    }

    if (question.questionType === 'basic') {
      selectBasicAnswers(question);
      continue;
    }

    if (question.questionType === 'match') {
      selectMatchAnswers(question);
      continue;
    }

    question.questionElement?.click();
  }

  await delay(AUTO_ANSWER_SETTLE_MS);
};

const queueAutoSubmit = signature => {
  pendingAutoSubmit = {
    signature,
    answeredAt: Date.now()
  };
};

const handleAutoFinalSubmit = () => {
  const confirmExam = getAutoFinalConfirm();
  const submitButton = getAutoFinalSubmitButton();

  if (!confirmExam || !submitButton) {
    if (isAutoFinalSubmitPending) {
      completeAutoFlow();
      return true;
    }

    return false;
  }

  if (!confirmExam.checked) {
    confirmExam.click();
  }

  if (!isSubmitButtonReady(submitButton)) {
    setAutoFlowStatus('Waiting for final submit button...');
    return true;
  }

  setAutoFlowStatus('Submitting final answers...');

  if (Date.now() - lastAutoFinalSubmitAt >= AUTO_SUBMIT_RETRY_MS) {
    submitButton.click();
    lastAutoFinalSubmitAt = Date.now();
    isAutoFinalSubmitPending = true;
  }

  return true;
};

const runAutoFlow = async () => {
  if (!isAutoFlowEnabled)
    return;

  if (handleAutoFinalSubmit())
    return;

  if (autoStartReadyAt === 0) {
    setAutoFlowStatus('Waiting for start command...');
    return;
  }

  if (Date.now() < autoStartReadyAt) {
    setAutoFlowStatus('Waiting 1 second before starting...');
    return;
  }

  if (isSuspendRunning) {
    setAutoFlowStatus('Preparing questions...');
    return;
  }

  if (components.length === 0) {
    setAutoFlowStatus('Waiting for question data...');
    return;
  }

  if (!setIsReady()) {
    setAutoFlowStatus('Waiting for visible questions...');
    return;
  }

  const submitButton = getAutoSubmitButton();
  const signature = getVisibleQuestionSignature();

  if (!submitButton || !signature) {
    setAutoFlowStatus('Waiting for submit button...');
    return;
  }

  if (lastAutoAttempt.signature === signature && Date.now() - lastAutoAttempt.at < AUTO_SUBMIT_RETRY_MS && pendingAutoSubmit.signature !== signature) {
    setAutoFlowStatus('Waiting for next page...');
    return;
  }

  if (pendingAutoSubmit.signature !== signature) {
    setAutoFlowStatus('Answering questions...');
    await main();
    await autoAnswerQuestions();
    queueAutoSubmit(signature);
  }

  const refreshedSubmitButton = getAutoSubmitButton();

  if (!isSubmitButtonReady(refreshedSubmitButton)) {
    if (pendingAutoSubmit.signature === signature && Date.now() - pendingAutoSubmit.answeredAt >= AUTO_SUBMIT_RETRY_MS) {
      setAutoFlowStatus('Rechecking answers before submit...');
      await main();
      await autoAnswerQuestions();
      queueAutoSubmit(signature);
    }

    setAutoFlowStatus('Polling submit button...');
    return;
  }

  setAutoFlowStatus('Submitting current page...');
  refreshedSubmitButton.click();
  resetPendingAutoSubmit();

  lastAutoAttempt = {
    signature,
    at: Date.now()
  };
  setAutoFlowStatus('Waiting for next page...');
};

const suspendAutoFlow = () => {
  if (autoFlowPromise)
    return;

  autoFlowPromise = runAutoFlow().finally(() => {
    autoFlowPromise = null;
  });
};

const main = async () => {
  questions = [];
  await setQuestionSections();
  setQuestionElements();
  initClickListeners();
  initHoverListeners();
};

const suspendMain = () => {
  if (isSuspendRunning) return;

  isSuspendRunning = true;

  const checking = async () => {
    if (setIsReady()) {
      clearInterval(interval);
      main().finally(() => {
        isSuspendRunning = false;
      });
    }
  };

  const interval = setInterval(checking, AUTO_FLOW_INTERVAL_MS);
};

if (window) {
  setInterval(() => {
    if (isSuspendRunning || components.length === 0)
      return;

    let visibleContainers = 0;
    for (const component of components) {
      if (deepHtmlSearch(document, `.${CSS.escape(component._id)}`)) {
        visibleContainers++;
      }
    }

    const processedCount = new Set(
      questions
        .map(question => question.id || question.questionDiv)
        .filter(Boolean)
    ).size;

    if (visibleContainers !== processedCount) {
      suspendMain();
    }
  }, AUTO_FLOW_INTERVAL_MS);

  setInterval(() => {
    suspendAutoFlow();
  }, AUTO_FLOW_INTERVAL_MS);
}

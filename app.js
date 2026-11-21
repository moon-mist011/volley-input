const POS_NAMES = {
  1: "レフト", 2: "センター", 3: "ライト",
  4: "バック(L)", 5: "バック(C)", 6: "バック(R)",
  7: "パイプ", 8: "セミ", 9: "その他"
};
const TOSS_NAMES = {
  1: "オープン", 2: "平行", 3: "Aクイック",
  4: "Bクイック", 5: "Cクイック", 6: "Dクイック",
  7: "バック", 8: "セミ", 9: "その他"
};
const RESULT_NAMES = { 0: "継続", 1: "決定", 2: "ミス", 3: "ブロックアウト" };
const TARGET_URL = "https://valley-6121a.web.app/";
const MAX_ROSTER_SIZE = 14;
const MAX_LIBERO_COUNT = 2;

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.error(`保存データの読み込みに失敗しました: ${key}`, error);
    return fallback;
  }
}

function normalizeRoster(roster) {
  if (!Array.isArray(roster)) return [];
  const players = [...new Map(roster.map(entry => {
    const player = typeof entry === "number" ? { number: entry, libero: false } : entry;
    return [Number(player?.number), {
      number: Number(player?.number),
      libero: Boolean(player?.libero)
    }];
  }).filter(([number]) => Number.isInteger(number) && number >= 0 && number <= 99))].map(([, player]) => player)
    .sort((a, b) => a.number - b.number)
    .slice(0, MAX_ROSTER_SIZE);
  let liberoCount = 0;
  return players.map(player => {
    if (!player.libero) return player;
    liberoCount += 1;
    return { ...player, libero: liberoCount <= MAX_LIBERO_COUNT };
  });
}

const storedRoster = readStorage("volley-spike-roster", null);
const storedBaselineSide = readStorage("volley-spike-baseline-side", "near");
const state = {
  schoolName: readStorage("volley-spike-school", ""),
  opponentName: readStorage("volley-spike-opponent", ""),
  roster: normalizeRoster(storedRoster === null ? [] : storedRoster),
  records: readStorage("volley-spike-records", []),
  step: 0,
  baselineSide: storedBaselineSide === "far" ? "far" : "near",
  courseFlipped: readStorage("volley-spike-course-flipped", false),
  matchActive: readStorage("volley-spike-match-active", false),
  currentMatchId: readStorage("volley-spike-current-match", null),
  lastFinishedSnapshot: readStorage("volley-spike-finish-snapshot", null),
  historyOpen: false,
  selectedHistoryKey: null,
  current: { player: null, position: null, toss: null, course: null, result: null }
};

function el(id) {
  return document.getElementById(id);
}

function createMatchId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`保存に失敗しました: ${key}`, error);
    showToast("保存できませんでした。端末の空き容量を確認してください");
  }
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function renderRoster() {
  const list = el("rosterList");
  list.replaceChildren();
  el("rosterCount").textContent = `${state.roster.length}/${MAX_ROSTER_SIZE}人`;
  el("addPlayer").disabled = state.roster.length >= MAX_ROSTER_SIZE;
  el("isLibero").disabled = state.roster.filter(player => player.libero).length >= MAX_LIBERO_COUNT;

  state.roster.forEach(player => {
    const item = document.createElement("li");
    item.className = "roster-item";

    const numberButton = document.createElement("button");
    numberButton.type = "button";
    numberButton.className = "roster-number-button";
    numberButton.textContent = `#${player.number}`;
    numberButton.setAttribute("aria-expanded", "false");
    const liberoEditor = document.createElement("label");
    liberoEditor.className = "roster-libero-editor";
    liberoEditor.hidden = true;
    const liberoCheckbox = document.createElement("input");
    liberoCheckbox.type = "checkbox";
    liberoCheckbox.checked = player.libero;
    const liberoText = document.createElement("span");
    liberoText.textContent = "リベロ";
    liberoEditor.append(liberoCheckbox, liberoText);
    numberButton.addEventListener("click", () => {
      liberoEditor.hidden = !liberoEditor.hidden;
      numberButton.setAttribute("aria-expanded", String(!liberoEditor.hidden));
    });
    liberoCheckbox.addEventListener("change", () => {
      if (liberoCheckbox.checked && !player.libero &&
          state.roster.filter(entry => entry.libero).length >= MAX_LIBERO_COUNT) {
        liberoCheckbox.checked = false;
        showToast(`リベロは${MAX_LIBERO_COUNT}人まで登録できます`);
        return;
      }
      player.libero = liberoCheckbox.checked;
      save("volley-spike-roster", state.roster);
      renderRoster();
    });

    if (player.libero) {
      const badge = document.createElement("span");
      badge.className = "libero-badge";
      badge.textContent = "リベロ";
      numberButton.append(" ", badge);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-player";
    remove.textContent = "削除";
    remove.setAttribute("aria-label", `背番号${player.number}を削除`);
    remove.addEventListener("click", () => {
      state.roster = state.roster.filter(entry => entry.number !== player.number);
      save("volley-spike-roster", state.roster);
      renderRoster();
    });

    item.append(numberButton, liberoEditor, remove);
    list.append(item);
  });
}

function addPlayer() {
  const number = Number(el("playerNumber").value);
  const message = el("setupMessage");
  if (el("playerNumber").value === "" || !Number.isInteger(number) || number < 0 || number > 99) {
    message.textContent = "背番号は0〜99の整数で入力してください。";
    el("playerNumber").focus();
    return;
  }
  if (state.roster.some(player => player.number === number)) {
    message.textContent = `背番号${number}はすでに登録されています。`;
    return;
  }
  if (state.roster.length >= MAX_ROSTER_SIZE) {
    message.textContent = `選手は${MAX_ROSTER_SIZE}人まで登録できます。`;
    return;
  }
  if (el("isLibero").checked &&
      state.roster.filter(player => player.libero).length >= MAX_LIBERO_COUNT) {
    message.textContent = `リベロは${MAX_LIBERO_COUNT}人まで登録できます。`;
    return;
  }

  state.roster.push({ number, libero: el("isLibero").checked });
  state.roster.sort((a, b) => a.number - b.number);
  save("volley-spike-roster", state.roster);
  renderRoster();
  message.textContent = `背番号${number}${el("isLibero").checked ? "（リベロ）" : ""}を登録しました。`;
  el("playerNumber").value = "";
  el("isLibero").checked = false;
  el("playerNumber").focus();
}

function startMatch(event) {
  event.preventDefault();
  const schoolName = el("schoolName").value.trim();
  const opponentName = el("opponentName").value.trim();
  if (!schoolName) {
    el("schoolName").focus();
    return;
  }
  if (!opponentName) {
    el("opponentName").focus();
    return;
  }
  if (state.roster.length === 0) {
    el("setupMessage").textContent = "背番号を1人以上登録してください。";
    el("playerNumber").focus();
    return;
  }
  state.schoolName = schoolName;
  state.opponentName = opponentName;
  state.baselineSide = el("baselineFar").checked ? "far" : "near";
  if (!state.matchActive) {
    state.courseFlipped = state.baselineSide === "far";
    state.currentMatchId = createMatchId();
    save("volley-spike-course-flipped", state.courseFlipped);
    save("volley-spike-current-match", state.currentMatchId);
  } else if (!state.currentMatchId) {
    state.currentMatchId = createMatchId();
    save("volley-spike-current-match", state.currentMatchId);
  }
  state.matchActive = true;
  save("volley-spike-school", schoolName);
  save("volley-spike-opponent", opponentName);
  save("volley-spike-baseline-side", state.baselineSide);
  save("volley-spike-match-active", state.matchActive);
  state.lastFinishedSnapshot = null;
  save("volley-spike-finish-snapshot", null);
  el("undoFinish").hidden = true;
  el("activeSchool").textContent = `${schoolName}　対　${opponentName}`;
  el("setupScreen").hidden = true;
  el("matchScreen").hidden = false;
  el("editSetup").hidden = false;
  state.step = 0;
  state.current = { player: null, position: null, toss: null, course: null, result: null };
  renderHistory();
  renderStep();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function finishMatch() {
  state.lastFinishedSnapshot = {
    schoolName: state.schoolName,
    opponentName: state.opponentName,
    roster: state.roster.map(player => ({ ...player })),
    baselineSide: state.baselineSide,
    courseFlipped: state.courseFlipped,
    currentMatchId: state.currentMatchId,
    step: state.step,
    current: { ...state.current }
  };
  save("volley-spike-finish-snapshot", state.lastFinishedSnapshot);
  state.step = 0;
  state.matchActive = false;
  state.currentMatchId = null;
  state.courseFlipped = false;
  state.schoolName = "";
  state.opponentName = "";
  state.roster = [];
  state.baselineSide = "near";
  save("volley-spike-match-active", state.matchActive);
  save("volley-spike-current-match", null);
  save("volley-spike-course-flipped", false);
  save("volley-spike-school", "");
  save("volley-spike-opponent", "");
  save("volley-spike-roster", []);
  save("volley-spike-baseline-side", "near");
  state.current = { player: null, position: null, toss: null, course: null, result: null };
  el("schoolName").value = "";
  el("opponentName").value = "";
  el("playerNumber").value = "";
  el("isLibero").checked = false;
  el("setupMessage").textContent = "";
  el("baselineNear").checked = true;
  el("baselineFar").checked = false;
  el("undoFinish").hidden = false;
  renderRoster();
  el("matchScreen").hidden = true;
  el("setupScreen").hidden = false;
  el("editSetup").hidden = true;
  renderHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function undoFinish() {
  const snapshot = state.lastFinishedSnapshot;
  if (!snapshot) return;

  state.schoolName = snapshot.schoolName;
  state.opponentName = snapshot.opponentName;
  state.roster = normalizeRoster(snapshot.roster);
  state.baselineSide = snapshot.baselineSide === "far" ? "far" : "near";
  state.courseFlipped = Boolean(snapshot.courseFlipped);
  state.currentMatchId = snapshot.currentMatchId || createMatchId();
  state.step = Number.isInteger(snapshot.step) ? snapshot.step : 0;
  state.current = { ...snapshot.current };
  state.matchActive = true;
  state.lastFinishedSnapshot = null;

  save("volley-spike-school", state.schoolName);
  save("volley-spike-opponent", state.opponentName);
  save("volley-spike-roster", state.roster);
  save("volley-spike-baseline-side", state.baselineSide);
  save("volley-spike-course-flipped", state.courseFlipped);
  save("volley-spike-current-match", state.currentMatchId);
  save("volley-spike-match-active", true);
  save("volley-spike-finish-snapshot", null);

  el("schoolName").value = state.schoolName;
  el("opponentName").value = state.opponentName;
  el("baselineNear").checked = state.baselineSide === "near";
  el("baselineFar").checked = state.baselineSide === "far";
  el("activeSchool").textContent = `${state.schoolName}　対　${state.opponentName}`;
  el("undoFinish").hidden = true;
  el("setupScreen").hidden = true;
  el("matchScreen").hidden = false;
  el("editSetup").hidden = false;
  renderRoster();
  renderHistory();
  renderStep();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const STEP_INFO = [
  { key: "player", question: "打った選手は？", hint: "背番号を選んでください" },
  { key: "position", question: "スパイカーの位置は？", hint: "打った位置を選んでください" },
  { key: "toss", question: "トスの種類は？", hint: "上がったトスを選んでください" },
  { key: "course", question: "コースは？", hint: "相手コートの位置を選んでください" },
  { key: "result", question: "結果は？", hint: "プレーの結果を選んでください" }
];

function makeChoice(value, label, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `choice-button ${className}`.trim();
  button.textContent = label;
  button.addEventListener("click", () => choose(value));
  return button;
}

function renderStep() {
  const info = STEP_INFO[state.step];
  const area = el("choiceArea");
  area.replaceChildren();
  el("question").textContent = info.question;
  const selected = [];
  if (state.current.player !== null) {
    const player = state.roster.find(entry => entry.number === state.current.player);
    selected.push(`#${state.current.player}${player?.libero ? "（リベロ）" : ""}`);
  }
  if (state.current.position !== null) selected.push(POS_NAMES[state.current.position]);
  if (state.current.toss !== null) selected.push(TOSS_NAMES[state.current.toss]);
  if (state.current.course !== null) {
    selected.push(state.current.course === 0 ? "その他" : `コース${state.current.course}`);
  }
  el("stepHint").textContent = selected.length
    ? `${info.hint}　｜　選択済み：${selected.join(" / ")}`
    : info.hint;
  el("stepCounter").textContent = `${state.step + 1} / ${STEP_INFO.length}`;
  el("progressBar").style.width = `${((state.step + 1) / STEP_INFO.length) * 100}%`;
  const canUndoRecord = state.step === 0 &&
    state.records.some(record => record.matchId === state.currentMatchId);
  el("backButton").disabled = state.step === 0 && !canUndoRecord;
  el("backButton").textContent = canUndoRecord ? "↶ 直前を取り消す" : "← 戻る";

  if (info.key === "player") {
    area.className = "choice-grid player-choice-grid";
    state.roster.forEach(player => {
      const label = document.createElement("span");
      label.className = "player-choice-label";
      label.textContent = `#${player.number}`;
      if (player.libero) {
        const badge = document.createElement("small");
        badge.textContent = "リベロ";
        label.append(" ", badge);
      }
      const button = makeChoice(player.number, "");
      button.append(label);
      area.append(button);
    });
  } else if (info.key === "position") {
    area.className = "choice-grid position-choice-grid";
    Object.entries(POS_NAMES).forEach(([number, name]) => area.append(makeChoice(Number(number), name)));
  } else if (info.key === "toss") {
    area.className = "choice-grid";
    Object.entries(TOSS_NAMES).forEach(([number, name]) => area.append(makeChoice(Number(number), name)));
  } else if (info.key === "course") {
    area.className = "course-choice-area";
    const toolbar = document.createElement("div");
    toolbar.className = "course-toolbar";
    const orientation = document.createElement("span");
    orientation.className = "course-orientation";
    orientation.textContent = state.courseFlipped ? "エンドライン側が上" : "ネット側が上";
    const flipButton = document.createElement("button");
    flipButton.type = "button";
    flipButton.className = "flip-course-button";
    flipButton.textContent = "上下を反転";
    flipButton.addEventListener("click", () => {
      state.courseFlipped = !state.courseFlipped;
      save("volley-spike-course-flipped", state.courseFlipped);
      renderStep();
    });
    toolbar.append(orientation, flipButton);

    const label = document.createElement("p");
    label.className = "court-label";
    label.textContent = state.courseFlipped
      ? "↑ エンドライン側（後衛） ↑"
      : "↑ ネット側（前衛） ↑";
    const grid = document.createElement("div");
    grid.className = "course-grid";
    const courseOrder = Array.from({ length: 9 }, (_, index) => {
      const defaultCourse = index + 1;
      return state.courseFlipped ? 10 - defaultCourse : defaultCourse;
    });
    courseOrder.forEach(course => grid.append(makeChoice(course, String(course), "course-choice")));
    const oppositeLabel = document.createElement("p");
    oppositeLabel.className = "court-label";
    oppositeLabel.textContent = state.courseFlipped
      ? "↓ ネット側（前衛） ↓"
      : "↓ エンドライン側（後衛） ↓";
    area.append(toolbar, label, grid, oppositeLabel, makeChoice(0, "0　その他", "other-course"));
  } else {
    area.className = "choice-grid result-choice-grid";
    Object.entries(RESULT_NAMES).forEach(([number, name]) => area.append(makeChoice(Number(number), name, `result-${number}`)));
  }
}

function choose(value) {
  const key = STEP_INFO[state.step].key;
  state.current[key] = value;
  if (state.step === STEP_INFO.length - 1) {
    addRecord();
    return;
  }
  state.step += 1;
  renderStep();
}

function backOneStep() {
  if (state.step > 0) {
    state.current[STEP_INFO[state.step - 1].key] = null;
    state.step -= 1;
    renderStep();
    return;
  }
  const lastCurrentRecordIndex = state.records.findIndex(
    record => record.matchId === state.currentMatchId
  );
  if (lastCurrentRecordIndex === -1) return;

  const [last] = state.records.splice(lastCurrentRecordIndex, 1);
  state.current = {
    player: last.player,
    position: last.position,
    toss: last.toss,
    course: last.course,
    result: null
  };
  state.step = STEP_INFO.length - 1;
  saveRecords();
  renderStep();
  showToast("直前の記録を取り消しました。結果を選び直してください");
}

function addRecord() {
  const player = state.roster.find(entry => entry.number === state.current.player);
  const code = [
    String(state.current.player).padStart(2, "0"),
    state.current.position,
    state.current.toss,
    state.current.course,
    state.current.result
  ].join("");
  state.records.unshift({
    matchId: state.currentMatchId,
    school: state.schoolName,
    opponent: state.opponentName,
    player: state.current.player,
    libero: Boolean(player?.libero),
    position: state.current.position,
    toss: state.current.toss,
    course: state.current.course,
    result: state.current.result,
    code,
    entered: false,
    time: new Date().toISOString()
  });
  saveRecords();
  showToast(`${code} を記録しました`);
  state.step = 0;
  state.current = { player: null, position: null, toss: null, course: null, result: null };
  renderStep();
}

function saveRecords() {
  save("volley-spike-records", state.records);
  renderHistory();
}

function getHistoryGroupKey(record) {
  return record.matchId
    ? `match:${record.matchId}`
    : `legacy:${JSON.stringify([record.school || "", record.opponent || ""])}`;
}

function makeHistoryRecordItem(record, groupName) {
  const item = document.createElement("li");
  item.className = "history-item";
  const course = record.course === 0 ? "その他" : `コース${record.course}`;
  const time = new Date(record.time).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const detail = document.createElement("div");
  detail.className = "history-detail";
  const matchup = document.createElement("span");
  matchup.className = "history-matchup";
  if (record.school || record.opponent) {
    matchup.textContent = `${record.school || ""}　対　${record.opponent || ""}`;
  }
  const title = document.createElement("strong");
  title.textContent = `#${record.player}${record.libero ? "（リベロ）" : ""}　${POS_NAMES[record.position]}　${TOSS_NAMES[record.toss]}`;
  const description = document.createElement("span");
  description.textContent = `${course}　${RESULT_NAMES[record.result]}　${time}`;
  const code = document.createElement("span");
  code.className = "history-code";
  code.textContent = record.code;
  const enteredLabel = document.createElement("label");
  enteredLabel.className = "entered-toggle";
  const enteredCheckbox = document.createElement("input");
  enteredCheckbox.type = "checkbox";
  enteredCheckbox.checked = Boolean(record.entered);
  enteredCheckbox.addEventListener("change", () => {
    record.entered = enteredCheckbox.checked;
    saveRecords();
  });
  const enteredText = document.createElement("span");
  enteredText.textContent = "入力済";
  enteredLabel.append(enteredCheckbox, enteredText);
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-record";
  deleteButton.textContent = "削除";
  deleteButton.setAttribute("aria-label", `${groupName}の記録を削除`);
  deleteButton.addEventListener("click", () => {
    const index = state.records.indexOf(record);
    if (index !== -1) state.records.splice(index, 1);
    saveRecords();
  });
  if (matchup.textContent) detail.append(matchup);
  detail.append(title, description);
  item.append(detail, code, enteredLabel, deleteButton);
  return item;
}

function renderHistory() {
  const groups = new Map();
  state.records.forEach(record => {
    const key = getHistoryGroupKey(record);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        school: record.school || "",
        opponent: record.opponent || "",
        records: []
      });
    }
    groups.get(key).records.push(record);
  });
  const matchGroups = [...groups.values()];
  if (state.selectedHistoryKey && !groups.has(state.selectedHistoryKey)) {
    state.selectedHistoryKey = null;
  }
  const selectedGroup = state.selectedHistoryKey
    ? groups.get(state.selectedHistoryKey)
    : null;

  el("historySummary").textContent = `${matchGroups.length}試合・${state.records.length}件`;
  el("historyBrowser").hidden = !state.historyOpen;
  el("historyToggle").setAttribute("aria-expanded", String(state.historyOpen));
  el("historyToggleLabel").textContent = state.historyOpen ? "入力履歴を閉じる" : "入力履歴を見る";
  el("historyHub").hidden = state.matchActive;
  el("currentMatchHistory").hidden = !state.matchActive;
  el("matchListView").hidden = Boolean(selectedGroup);
  el("matchDetailView").hidden = !selectedGroup;
  el("emptyHistory").hidden = state.records.length > 0;
  el("copyAll").disabled = state.records.length === 0;
  el("copyMatch").disabled = !selectedGroup;
  const canUndoRecord = state.step === 0 &&
    state.records.some(record => record.matchId === state.currentMatchId);
  el("backButton").disabled = state.step === 0 && !canUndoRecord;
  if (state.step === 0) {
    el("backButton").textContent = canUndoRecord ? "↶ 直前を取り消す" : "← 戻る";
  }

  const currentRecords = state.currentMatchId
    ? state.records.filter(record => record.matchId === state.currentMatchId)
    : [];
  el("currentMatchRecordCount").textContent = `${currentRecords.length} 件`;
  el("emptyCurrentMatch").hidden = currentRecords.length > 0;
  const currentMatchList = el("currentMatchHistoryList");
  currentMatchList.replaceChildren();
  currentRecords.forEach(record => {
    currentMatchList.append(makeHistoryRecordItem(record, "この試合"));
  });

  const cards = el("matchCards");
  cards.replaceChildren();
  matchGroups.forEach(group => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "match-card";
    const matchup = document.createElement("strong");
    matchup.textContent = `${group.school || "校名未登録"}　対　${group.opponent || "対戦校未登録"}`;
    const details = document.createElement("span");
    const enteredCount = group.records.filter(record => record.entered).length;
    details.textContent = `${group.records.length}件の記録　／　入力済 ${enteredCount}件`;
    card.append(matchup, details);
    card.addEventListener("click", () => {
      state.selectedHistoryKey = group.key;
      renderHistory();
    });
    cards.append(card);
  });

  const list = el("historyList");
  list.replaceChildren();
  if (!selectedGroup) return;
  el("detailMatchup").textContent =
    `${selectedGroup.school || "校名未登録"}　対　${selectedGroup.opponent || "対戦校未登録"}`;
  el("recordCount").textContent = `${selectedGroup.records.length} 件`;

  selectedGroup.records.forEach(record => {
    list.append(makeHistoryRecordItem(
      record,
      `${selectedGroup.school || "校名未登録"} 対 ${selectedGroup.opponent || "対戦校未登録"}`
    ));
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("クリップボードにコピーしました");
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      console.error("クリップボードへのコピーに失敗しました", error);
      showToast("コピーできませんでした");
      return;
    }
    showToast("クリップボードにコピーしました");
  }
}

el("addPlayer").addEventListener("click", addPlayer);
el("playerNumber").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    addPlayer();
  }
});
el("schoolForm").addEventListener("submit", startMatch);
el("baselineNear").checked = state.baselineSide === "near";
el("baselineFar").checked = state.baselineSide === "far";
el("baselineNear").addEventListener("change", () => {
  if (!el("baselineNear").checked) return;
  state.baselineSide = "near";
  save("volley-spike-baseline-side", state.baselineSide);
});
el("baselineFar").addEventListener("change", () => {
  if (!el("baselineFar").checked) return;
  state.baselineSide = "far";
  save("volley-spike-baseline-side", state.baselineSide);
});
el("backButton").addEventListener("click", backOneStep);
el("finishMatch").addEventListener("click", finishMatch);
el("undoFinish").addEventListener("click", undoFinish);
el("historyToggle").addEventListener("click", () => {
  state.historyOpen = !state.historyOpen;
  if (!state.historyOpen) state.selectedHistoryKey = null;
  renderHistory();
});
el("backToMatchList").addEventListener("click", () => {
  state.selectedHistoryKey = null;
  renderHistory();
});
el("editSetup").addEventListener("click", () => {
  el("matchScreen").hidden = true;
  el("setupScreen").hidden = false;
  el("editSetup").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
});
el("copyAll").addEventListener("click", () => {
  copyText(state.records.map(record => record.code).reverse().join("\n"));
});
el("copyMatch").addEventListener("click", () => {
  const codes = state.records
    .filter(record => getHistoryGroupKey(record) === state.selectedHistoryKey)
    .map(record => record.code)
    .reverse();
  copyText(codes.join("\n"));
});
el("openTarget").addEventListener("click", () => window.open(TARGET_URL, "_blank", "noopener"));

el("schoolName").value = state.schoolName;
el("opponentName").value = state.opponentName;
el("undoFinish").hidden = !state.lastFinishedSnapshot;
renderRoster();
renderHistory();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
    .then(registration => registration.update())
    .catch(error => console.error("Service Workerの登録に失敗しました", error));
}

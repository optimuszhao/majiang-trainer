const SUIT_ORDER = { wan: 0, tiao: 1, tong: 2, wind: 3, dragon: 4 };
const PLAYER_ORDER = ["me", "right", "across", "left"];
const PLAYER_NAME = { me: "我", right: "下家", across: "对家", left: "上家" };
const SOURCE_MARK = { me: "我", right: "下", across: "对", left: "上" };
const AI_LEVELS = [
  { value: 1, label: "新手" },
  { value: 2, label: "普通" },
  { value: 3, label: "熟练" },
  { value: 4, label: "高手" },
  { value: 5, label: "老手" },
];
const BOT_DELAY = 2000;

const TILE_DEFS = [
  ...Array.from({ length: 9 }, (_, i) => makeSuit("wan", i + 1, `${numName(i + 1)}万`)),
  ...Array.from({ length: 9 }, (_, i) => makeSuit("tiao", i + 1, `${numName(i + 1)}条`)),
  ...Array.from({ length: 9 }, (_, i) => makeSuit("tong", i + 1, `${numName(i + 1)}筒`)),
  { id: "wind-east", suit: "wind", rank: 1, name: "东", img: "assets/tiles/wind-east.png", isRedJoker: false },
  { id: "wind-south", suit: "wind", rank: 2, name: "南", img: "assets/tiles/wind-south.png", isRedJoker: false },
  { id: "wind-west", suit: "wind", rank: 3, name: "西", img: "assets/tiles/wind-west.png", isRedJoker: false },
  { id: "wind-north", suit: "wind", rank: 4, name: "北", img: "assets/tiles/wind-north.png", isRedJoker: false },
  { id: "dragon-red", suit: "dragon", rank: 1, name: "红中", img: "assets/tiles/dragon-red.png", isRedJoker: true },
  { id: "dragon-green", suit: "dragon", rank: 2, name: "发", img: "assets/tiles/dragon-green.png", isRedJoker: false },
  { id: "dragon-white", suit: "dragon", rank: 3, name: "白", img: "assets/tiles/dragon-white.png", isRedJoker: false },
];
const TILE_BY_ID = Object.fromEntries(TILE_DEFS.map((tile) => [tile.id, tile]));
const NON_RED_IDS = TILE_DEFS.filter((tile) => !tile.isRedJoker).map((tile) => tile.id);

function makeSuit(suit, rank, name) {
  return { id: `${suit}-${rank}`, suit, rank, name, img: `assets/tiles/${suit}-${rank}.png`, isRedJoker: false };
}
function numName(n) {
  return ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"][n];
}

const $ = (id) => document.getElementById(id);
const els = {
  statusText: $("statusText"),
  startBtn: $("startBtn"),
  emptyStartBtn: $("emptyStartBtn"),
  restartBtn: $("restartBtn"),
  hintBtn: $("hintBtn"),
  rulesBtn: $("rulesBtn"),
  settlementBtn: $("settlementBtn"),
  endBtn: $("endBtn"),
  baseMoneySelect: $("baseMoneySelect"),
  customBaseMoney: $("customBaseMoney"),
  leftAi: $("leftAi"),
  acrossAi: $("acrossAi"),
  rightAi: $("rightAi"),
  emptyState: $("emptyState"),
  gameBoard: $("gameBoard"),
  actionBar: $("actionBar"),
  hintPanel: $("hintPanel"),
  rulesDialog: $("rulesDialog"),
  closeRulesBtn: $("closeRulesBtn"),
  settlementDialog: $("settlementDialog"),
  closeSettlementBtn: $("closeSettlementBtn"),
  settlementContent: $("settlementContent"),
  toast: $("toast"),
};

const state = {
  wall: [],
  players: [],
  currentPlayerIndex: 0,
  lastDiscard: null,
  discardPool: [],
  round: 1,
  turn: 0,
  baseMoney: 2,
  status: "idle",
  actionOptions: [],
  kongRecords: [],
  winner: null,
  settlement: null,
  selectedUid: null,
  showHint: false,
  busy: false,
  draggingUid: null,
  dragInsertIndex: -1,
  dragPointer: null,
  latestDrawNotice: null,
};

const audio = createAudioEngine();
let latestDrawTimer = null;

initControls();
renderGame();

function initControls() {
  for (const select of [els.leftAi, els.acrossAi, els.rightAi]) {
    select.innerHTML = AI_LEVELS.map((level) => `<option value="${level.value}">${level.label}</option>`).join("");
    select.value = "3";
  }
  els.startBtn.addEventListener("click", startGame);
  els.emptyStartBtn.addEventListener("click", startGame);
  els.restartBtn.addEventListener("click", startGame);
  els.hintBtn.addEventListener("click", () => {
    state.showHint = !state.showHint;
    renderGame();
  });
  els.rulesBtn.addEventListener("click", renderRuleModal);
  els.closeRulesBtn.addEventListener("click", () => els.rulesDialog.close());
  els.settlementBtn.addEventListener("click", renderSettlementModal);
  els.closeSettlementBtn.addEventListener("click", () => els.settlementDialog.close());
  els.endBtn.addEventListener("click", () => {
    state.status = "ended";
    state.winner = null;
    renderGame();
    showToast("本局已结束");
  });
  els.baseMoneySelect.addEventListener("change", () => {
    els.customBaseMoney.classList.toggle("hidden", els.baseMoneySelect.value !== "custom");
    state.baseMoney = getBaseMoney();
    renderGame();
  });
  els.customBaseMoney.addEventListener("input", () => {
    state.baseMoney = getBaseMoney();
    renderGame();
  });
}

function getBaseMoney() {
  if (els.baseMoneySelect.value === "custom") return Math.max(1, Number(els.customBaseMoney.value) || 1);
  return Number(els.baseMoneySelect.value);
}

function createTiles() {
  let uid = 1;
  const tiles = [];
  for (const def of TILE_DEFS) {
    for (let i = 0; i < 4; i++) {
      tiles.push({ ...def, uid: `${def.id}-${uid++}` });
    }
  }
  return tiles;
}

function createWall() {
  return createTiles();
}

function shuffleWall(wall) {
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

function createPlayers() {
  return [
    { id: "me", name: "我", type: "human", aiLevel: null, hand: [], discards: [], melds: [], money: 0 },
    { id: "right", name: "下家", type: "bot", aiLevel: Number(els.rightAi.value), hand: [], discards: [], melds: [], money: 0 },
    { id: "across", name: "对家", type: "bot", aiLevel: Number(els.acrossAi.value), hand: [], discards: [], melds: [], money: 0 },
    { id: "left", name: "上家", type: "bot", aiLevel: Number(els.leftAi.value), hand: [], discards: [], melds: [], money: 0 },
  ];
}

function startGame() {
  state.baseMoney = getBaseMoney();
  state.wall = shuffleWall(createWall());
  state.players = createPlayers();
  state.currentPlayerIndex = 0;
  state.lastDiscard = null;
  state.discardPool = [];
  state.turn = 1;
  state.status = "waitingHumanDiscard";
  state.actionOptions = [];
  state.kongRecords = [];
  state.winner = null;
  state.settlement = null;
  state.selectedUid = null;
  state.showHint = false;
  state.busy = false;
  state.draggingUid = null;
  state.dragInsertIndex = -1;
  state.dragPointer = null;
  state.latestDrawNotice = null;
  window.clearTimeout(latestDrawTimer);
  dealInitialHands();
  sortHand(getHuman().hand);
  for (const player of state.players.filter((player) => player.id !== "me")) sortHand(player.hand);
  drawTile("me");
  audio.play("start");
  renderGame();
}

function dealInitialHands() {
  for (let round = 0; round < 13; round++) {
    for (const player of state.players) player.hand.push(state.wall.shift());
  }
}

function drawTile(playerId) {
  const player = getPlayer(playerId);
  const tile = state.wall.shift();
  if (tile) {
    player.hand.push(tile);
    audio.play(playerId === "me" ? "drawMe" : "drawBot");
    if (playerId === "me") setLatestDrawNotice(tile, "新摸");
  }
  return tile || null;
}

function drawFromTail(playerId) {
  const player = getPlayer(playerId);
  const tile = state.wall.pop();
  if (tile) {
    player.hand.push(tile);
    audio.play("gangDraw");
    if (playerId === "me") setLatestDrawNotice(tile, "补牌");
  }
  return tile || null;
}

function discardTile(playerId, tileUid) {
  const player = getPlayer(playerId);
  const index = player.hand.findIndex((tile) => tile.uid === tileUid);
  if (index < 0) return null;
  const [tile] = player.hand.splice(index, 1);
  player.discards.push(tile);
  state.lastDiscard = { tile, by: playerId };
  state.discardPool.push({ tile, by: playerId, uid: `${tile.uid}-discard-${state.discardPool.length}` });
  audio.play(playerId === "me" ? "discardMe" : "discardBot");
  return tile;
}

function sortHand(hand) {
  return hand.sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || Number(a.rank) - Number(b.rank) || a.uid.localeCompare(b.uid));
}

function sortAllHands() {
  for (const player of state.players) sortHand(player.hand);
}

function setLatestDrawNotice(tile, label) {
  state.latestDrawNotice = {
    uid: tile.uid,
    label,
    text: `${label} ${tile.name}`,
  };
  window.clearTimeout(latestDrawTimer);
  latestDrawTimer = window.setTimeout(() => {
    state.latestDrawNotice = null;
    renderHand();
  }, 3000);
}

function getPlayer(playerId) {
  return state.players.find((player) => player.id === playerId);
}

function getHuman() {
  return getPlayer("me");
}

function countMap(tiles) {
  return tiles.reduce((map, tile) => {
    const id = typeof tile === "string" ? tile : tile.id;
    map[id] = (map[id] || 0) + 1;
    return map;
  }, {});
}

function canPeng(player, tile) {
  return player.hand.filter((item) => item.id === tile.id).length >= 2;
}

function canMingGang(player, tile) {
  return player.hand.filter((item) => item.id === tile.id).length >= 3;
}

function canAnGang(player) {
  const counts = countMap(player.hand);
  return Object.keys(counts).filter((id) => counts[id] >= 4);
}

function canBuGang(player) {
  return player.melds
    .filter((meld) => meld.type === "peng")
    .map((meld) => meld.tiles[0].id)
    .filter((id) => player.hand.some((tile) => tile.id === id));
}

function performPeng(playerId, tile) {
  const player = getPlayer(playerId);
  const taken = takeTilesById(player.hand, tile.id, 2);
  removeLastDiscardFromPool(tile);
  player.melds.push({ type: "peng", tiles: [...taken, tile], fromPlayerId: state.lastDiscard.by, ownerPlayerId: playerId });
  player.hand = sortHand(player.hand);
  state.lastDiscard = null;
  state.actionOptions = [];
  state.status = playerId === "me" ? "waitingHumanDiscard" : "botThinking";
  audio.play("peng");
  return player.melds[player.melds.length - 1];
}

function performGang(playerId, gangType, tile = null) {
  const player = getPlayer(playerId);
  let meld;
  if (gangType === "mingGang" && tile) {
    const taken = takeTilesById(player.hand, tile.id, 3);
    removeLastDiscardFromPool(tile);
    meld = { type: "mingGang", tiles: [...taken, tile], fromPlayerId: state.lastDiscard.by, ownerPlayerId: playerId };
    applyKongPayment(playerId, state.lastDiscard.by, "点杠");
  }
  if (gangType === "anGang") {
    const id = tile?.id || canAnGang(player)[0];
    const taken = takeTilesById(player.hand, id, 4);
    meld = { type: "anGang", tiles: taken, fromPlayerId: playerId, ownerPlayerId: playerId };
    applyKongPayment(playerId, null, "暗杠");
  }
  if (gangType === "buGang") {
    const id = tile?.id || canBuGang(player)[0];
    const addTile = takeTilesById(player.hand, id, 1)[0];
    const existing = player.melds.find((item) => item.type === "peng" && item.tiles[0].id === id);
    if (existing) {
      existing.type = "buGang";
      existing.tiles.push(addTile);
      meld = existing;
    }
    applyKongPayment(playerId, null, "补杠");
  }
  if (meld && !player.melds.includes(meld)) player.melds.push(meld);
  state.lastDiscard = null;
  state.actionOptions = [];
  afterGangDraw(playerId);
  audio.play("gang");
  return meld;
}

function afterGangDraw(playerId) {
  drawFromTail(playerId);
  sortHand(getPlayer(playerId).hand);
}

function applyKongPayment(winnerId, payerId, label) {
  const base = state.baseMoney;
  const winner = getPlayer(winnerId);
  const payers = payerId ? [getPlayer(payerId)] : state.players.filter((player) => player.id !== winnerId);
  for (const payer of payers) {
    payer.money -= base;
    winner.money += base;
  }
  state.kongRecords.push({
    label,
    playerId: winnerId,
    fromPlayerId: payerId,
    amount: base * payers.length,
    text: `${PLAYER_NAME[winnerId]}${label}，收入 ${base * payers.length} 元`,
  });
}

function takeTilesById(hand, id, count) {
  const taken = [];
  for (let i = hand.length - 1; i >= 0 && taken.length < count; i--) {
    if (hand[i].id === id) taken.push(hand.splice(i, 1)[0]);
  }
  return taken;
}

function removeLastDiscardFromPool(tile) {
  const index = [...state.discardPool].reverse().findIndex((item) => item.tile.uid === tile.uid);
  if (index >= 0) state.discardPool.splice(state.discardPool.length - 1 - index, 1);
}

function isWinningHand(hand, meldCount = 0) {
  return isSevenPairsWithRedJoker(hand) || isNormalWinWithRedJoker(hand, meldCount);
}

function isSevenPairsWithRedJoker(hand) {
  if (hand.length !== 14) return false;
  const reds = hand.filter((tile) => tile.isRedJoker).length;
  const counts = countMap(hand.filter((tile) => !tile.isRedJoker));
  let pairs = 0;
  let singles = 0;
  for (const count of Object.values(counts)) {
    pairs += Math.floor(count / 2);
    if (count % 2 === 1) singles++;
  }
  const redForSingles = Math.min(reds, singles);
  pairs += redForSingles;
  pairs += Math.floor((reds - redForSingles) / 2);
  return pairs >= 7;
}

function isNormalWinWithRedJoker(hand, meldCount = 0) {
  const groupsNeeded = 4 - meldCount;
  if (groupsNeeded < 0) return false;
  if (hand.length !== groupsNeeded * 3 + 2) return false;
  const reds = hand.filter((tile) => tile.isRedJoker).length;
  const counts = countMap(hand.filter((tile) => !tile.isRedJoker));
  for (const id of NON_RED_IDS) {
    const natural = counts[id] || 0;
    const need = Math.max(0, 2 - natural);
    if (need <= reds) {
      const next = { ...counts };
      next[id] = Math.max(0, natural - 2);
      if (canFormGroupsWithJoker(next, reds - need, groupsNeeded)) return true;
    }
  }
  if (reds >= 2 && canFormGroupsWithJoker({ ...counts }, reds - 2, groupsNeeded)) return true;
  return false;
}

function canFormGroupsWithJoker(counts, reds, groupsNeeded) {
  if (groupsNeeded === 0) return Object.values(counts).every((count) => count === 0);
  const id = NON_RED_IDS.find((tileId) => (counts[tileId] || 0) > 0);
  if (!id) return reds >= groupsNeeded * 3;
  const tile = TILE_BY_ID[id];

  const tripletUse = Math.min(3, counts[id]);
  const tripletNeed = 3 - tripletUse;
  if (tripletNeed <= reds) {
    const next = { ...counts, [id]: counts[id] - tripletUse };
    if (canFormGroupsWithJoker(cleanCounts(next), reds - tripletNeed, groupsNeeded - 1)) return true;
  }

  if (["wan", "tiao", "tong"].includes(tile.suit)) {
    for (let start = tile.rank - 2; start <= tile.rank; start++) {
      if (start < 1 || start > 7) continue;
      const ids = [`${tile.suit}-${start}`, `${tile.suit}-${start + 1}`, `${tile.suit}-${start + 2}`];
      if (!ids.includes(id)) continue;
      let need = 0;
      const next = { ...counts };
      for (const seqId of ids) {
        if ((next[seqId] || 0) > 0) next[seqId]--;
        else need++;
      }
      if (need <= reds && canFormGroupsWithJoker(cleanCounts(next), reds - need, groupsNeeded - 1)) return true;
    }
  }
  return false;
}

function cleanCounts(counts) {
  const next = { ...counts };
  for (const key of Object.keys(next)) if (next[key] <= 0) delete next[key];
  return next;
}

function explainWinFailure(player, extraTile = null) {
  const hand = extraTile ? [...player.hand, extraTile] : player.hand;
  const pairs = Object.values(countMap(hand.filter((tile) => !tile.isRedJoker))).filter((count) => count >= 2).length;
  const reds = hand.filter((tile) => tile.isRedJoker).length;
  if (pairs + reds < 1) return "当前还不能胡：缺少对子。";
  if (!isSevenPairsWithRedJoker(hand)) return `当前七小对只有 ${pairs} 对，红中 ${reds} 张。`;
  return "当前还不能胡：普通胡结构还差顺子或刻子。";
}

function calculateSevenPairsShanten(hand) {
  const reds = hand.filter((tile) => tile.isRedJoker).length;
  const counts = countMap(hand.filter((tile) => !tile.isRedJoker));
  let pairs = 0;
  let singles = 0;
  for (const count of Object.values(counts)) {
    pairs += Math.floor(count / 2);
    if (count % 2) singles++;
  }
  const redForSingles = Math.min(reds, singles);
  pairs += redForSingles + Math.floor((reds - redForSingles) / 2);
  return Math.max(0, 7 - pairs);
}

function calculateNormalShanten(hand, meldCount = 0) {
  if (isNormalWinWithRedJoker(hand, meldCount)) return 0;
  const reds = hand.filter((tile) => tile.isRedJoker).length;
  const counts = countMap(hand.filter((tile) => !tile.isRedJoker));
  let groups = meldCount;
  let pairs = 0;
  let partials = 0;
  const used = { ...counts };
  for (const id of Object.keys(used)) {
    while (used[id] >= 3) {
      used[id] -= 3;
      groups++;
    }
    if (used[id] >= 2) {
      used[id] -= 2;
      pairs++;
    }
  }
  for (const suit of ["wan", "tiao", "tong"]) {
    for (let rank = 1; rank <= 7; rank++) {
      const ids = [`${suit}-${rank}`, `${suit}-${rank + 1}`, `${suit}-${rank + 2}`];
      while (ids.every((id) => (used[id] || 0) > 0)) {
        ids.forEach((id) => used[id]--);
        groups++;
      }
    }
    for (let rank = 1; rank <= 8; rank++) {
      const a = `${suit}-${rank}`;
      const b = `${suit}-${rank + 1}`;
      while ((used[a] || 0) > 0 && (used[b] || 0) > 0) {
        used[a]--;
        used[b]--;
        partials++;
      }
    }
  }
  groups = Math.min(4, groups + reds);
  const cappedPartials = Math.min(4 - groups, partials);
  return Math.max(0, 8 - groups * 2 - cappedPartials - Math.min(1, pairs));
}

function calculateBestShanten(hand, meldCount = 0) {
  const normal = calculateNormalShanten(hand, meldCount);
  const seven = meldCount === 0 ? calculateSevenPairsShanten(hand) : 99;
  return {
    shanten: Math.min(normal, seven),
    normal,
    seven,
    route: seven < normal ? "七小对" : "普通胡",
  };
}

function getVisibleCounts() {
  return countMap([
    ...state.players.flatMap((player) => player.discards),
    ...getHuman().hand,
    ...state.players.flatMap((player) => player.melds.flatMap((meld) => meld.tiles)),
  ]);
}

function getAvailableActionsForHuman() {
  const human = getHuman();
  const actions = [];
  if (state.status === "waitingHumanDiscard" || state.status === "humanConfirmDiscard") {
    actions.push("win", "sort");
    if (canAnGang(human).length) actions.push("anGang");
    if (canBuGang(human).length) actions.push("buGang");
  }
  if (state.status === "waitingHumanResponse" && state.lastDiscard?.by !== "me") {
    const tile = state.lastDiscard.tile;
    if (isWinningHand([...human.hand, tile], human.melds.length)) actions.push("win");
    if (canMingGang(human, tile)) actions.push("mingGang");
    if (canPeng(human, tile)) actions.push("peng");
    actions.push("pass");
  }
  return actions;
}

function handleHumanWinClaim() {
  const human = getHuman();
  const extra = state.status === "waitingHumanResponse" ? state.lastDiscard?.tile : null;
  const hand = extra ? [...human.hand, extra] : human.hand;
  if (isWinningHand(hand, human.melds.length)) {
    if (extra) {
      human.hand.push(extra);
      removeLastDiscardFromPool(extra);
    }
    finishWin("me", extra ? "点炮胡" : "自摸胡");
    return;
  }
  handleHumanFalseWin(explainWinFailure(human, extra));
}

function handleHumanFalseWin(reason) {
  showToast(reason);
}

function recommendDiscard(player, gameState = state) {
  if (!player.hand.length) return null;
  const visible = getVisibleCounts();
  const current = calculateBestShanten(player.hand, player.melds.length);
  const counts = countMap(player.hand);
  const uniqueIds = [...new Set(player.hand.map((tile) => tile.id))];
  const candidates = uniqueIds.map((id) => {
    const tile = player.hand.find((item) => item.id === id);
    const rest = [...player.hand];
    rest.splice(rest.findIndex((item) => item.id === id), 1);
    const shanten = calculateBestShanten(rest, player.melds.length);
    const effectiveDraws = getEffectiveDraws(rest, player.melds.length);
    const effectiveCount = effectiveDraws.reduce((sum, drawId) => sum + Math.max(0, 4 - (visible[drawId] || 0)), 0);
    const isolated = isIsolated(id, counts);
    const pair = counts[id] >= 2;
    const honor = ["wind", "dragon"].includes(tile.suit);
    const red = tile.isRedJoker;
    const risk = getRiskLevel(id, visible[id] || 0);
    let score = 70 - shanten.shanten * 15 + Math.min(24, effectiveCount);
    if (isolated) score += 14;
    if (honor && isolated && !red) score += 10;
    if (pair) score -= current.route === "七小对" ? 22 : 12;
    if (red) score -= 40;
    if (risk === "较安全") score += 6;
    if (risk === "高危险") score -= 8;
    return {
      tile,
      score,
      shanten: shanten.shanten,
      route: shanten.route,
      effectiveDraws,
      effectiveCount,
      risk,
      reason: buildDiscardReason(tile, isolated, pair, red, effectiveCount),
    };
  }).sort((a, b) => b.score - a.score);
  return { best: candidates[0], candidates };
}

function getEffectiveDraws(hand, meldCount = 0) {
  const before = calculateBestShanten(hand, meldCount).shanten;
  return TILE_DEFS
    .filter((def) => (countMap(hand)[def.id] || 0) < 4)
    .filter((def) => calculateBestShanten([...hand, { ...def, uid: `test-${def.id}` }], meldCount).shanten < before)
    .map((def) => def.id);
}

function buildDiscardReason(tile, isolated, pair, red, effectiveCount) {
  if (red) return "红中是万能牌，通常保留到后期价值更高。";
  if (pair) return `${tile.name} 是对子，打出会降低碰牌、刻子或七小对价值。`;
  if (isolated) return `${tile.name} 是孤张，打出后可以保留主要搭子，预计有效进张 ${effectiveCount} 张。`;
  return `${tile.name} 关联度一般，打出后预计有效进张 ${effectiveCount} 张。`;
}

function isIsolated(id, counts) {
  const tile = TILE_BY_ID[id];
  if ((counts[id] || 0) > 1) return false;
  if (!["wan", "tiao", "tong"].includes(tile.suit)) return true;
  return [-2, -1, 1, 2].every((offset) => !counts[`${tile.suit}-${tile.rank + offset}`]);
}

function getRiskLevel(id, seen) {
  const tile = TILE_BY_ID[id];
  if (seen >= 3) return "较安全";
  if (["wind", "dragon"].includes(tile.suit)) return seen >= 2 ? "较安全" : "中等";
  if ([1, 9].includes(tile.rank)) return "较安全";
  if ([4, 5, 6].includes(tile.rank) && seen <= 1) return "高危险";
  return "中等";
}

function recommendPengOrPass(player, tile) {
  if (!canPeng(player, tile)) return { action: "pass", reason: "手牌没有两张相同牌。" };
  const before = calculateBestShanten(player.hand, player.melds.length).shanten;
  const rest = [...player.hand];
  takeVirtual(rest, tile.id, 2);
  const after = calculateBestShanten(rest, player.melds.length + 1).shanten;
  return after <= before ? { action: "peng", reason: "碰后向听更稳定。" } : { action: "pass", reason: "碰后手牌灵活度下降。" };
}

function takeVirtual(hand, id, count) {
  for (let i = hand.length - 1; i >= 0 && count > 0; i--) {
    if (hand[i].id === id) {
      hand.splice(i, 1);
      count--;
    }
  }
}

function botChooseDiscard(player, gameState = state) {
  const randomRate = { 1: .7, 2: .4, 3: .2, 4: .1, 5: .03 }[player.aiLevel] ?? .2;
  if (Math.random() < randomRate) return randomItem(player.hand);
  const rec = recommendDiscard(player, gameState);
  if (!rec) return randomItem(player.hand);
  return rec.best.tile;
}

function botShouldPeng(player, tile) {
  if (!canPeng(player, tile)) return false;
  const chance = { 1: .15, 2: .35, 3: .55, 4: .6, 5: .65 }[player.aiLevel] ?? .45;
  const rec = recommendPengOrPass(player, tile);
  return rec.action === "peng" && Math.random() < chance;
}

function botShouldGang(player, tile = null) {
  const chance = { 1: .25, 2: .45, 3: .68, 4: .82, 5: .95 }[player.aiLevel] ?? .6;
  if (tile) return canMingGang(player, tile) && Math.random() < chance;
  return (canAnGang(player).length || canBuGang(player).length) && Math.random() < chance;
}

function botShouldWin(player, hand = player.hand) {
  if (!isWinningHand(hand, player.melds.length)) return false;
  return Math.random() < ({ 1: .55, 2: .9, 3: .96, 4: 1, 5: 1 }[player.aiLevel] ?? .95);
}

function selectTile(uid) {
  if (state.dragPointer?.moved) return;
  if (state.draggingUid) return;
  if (!["waitingHumanDiscard", "humanConfirmDiscard"].includes(state.status)) return;
  state.selectedUid = uid;
  audio.play("select");
  state.status = "humanConfirmDiscard";
  renderGame();
}

function confirmHumanDiscard() {
  if (!state.selectedUid) return;
  discardTile("me", state.selectedUid);
  state.selectedUid = null;
  state.status = "botThinking";
  state.showHint = false;
  renderGame();
  window.setTimeout(async () => {
    if (await handleBotResponseToDiscard("me")) return;
    await continueAfterDiscard("me");
  }, 350);
}

async function handleBotResponseToDiscard(discarderId) {
  const last = state.lastDiscard;
  if (!last) return false;
  for (const playerId of nextPlayersAfter(discarderId).filter((id) => id !== "me")) {
    const player = getPlayer(playerId);
    if (botShouldWin(player, [...player.hand, last.tile])) {
      player.hand.push(last.tile);
      removeLastDiscardFromPool(last.tile);
      finishWin(playerId, "点炮胡");
      return true;
    }
    if (botShouldGang(player, last.tile)) {
      performGang(playerId, "mingGang", last.tile);
      renderGame();
      await delay(BOT_DELAY);
      if (botShouldWin(player)) return finishWin(playerId, "杠后胡"), true;
      const discard = botChooseDiscard(player);
      discardTile(playerId, discard.uid);
      renderGame();
      await continueAfterDiscard(playerId);
      return true;
    }
    if (botShouldPeng(player, last.tile)) {
      performPeng(playerId, last.tile);
      renderGame();
      await delay(BOT_DELAY);
      const discard = botChooseDiscard(player);
      discardTile(playerId, discard.uid);
      renderGame();
      await continueAfterDiscard(playerId);
      return true;
    }
  }
  return false;
}

function nextPlayersAfter(playerId) {
  const start = PLAYER_ORDER.indexOf(playerId);
  return [1, 2, 3].map((step) => PLAYER_ORDER[(start + step) % PLAYER_ORDER.length]);
}

async function continueAfterDiscard(discarderId) {
  if (state.status === "ended") return;
  const next = PLAYER_ORDER[(PLAYER_ORDER.indexOf(discarderId) + 1) % PLAYER_ORDER.length];
  if (next === "me") {
    const tile = drawTile("me");
    state.currentPlayerIndex = 0;
    state.turn++;
    state.status = "waitingHumanDiscard";
    state.actionOptions = [];
    renderGame();
    if (!tile) endExhaustedWall();
    return;
  }
  await runBotTurn(next);
}

async function runBotTurn(playerId) {
  const player = getPlayer(playerId);
  state.status = "botThinking";
  state.currentPlayerIndex = PLAYER_ORDER.indexOf(playerId);
  renderGame();
  await delay(BOT_DELAY);
  const drawn = drawTile(playerId);
  sortHand(player.hand);
  if (!drawn) return endExhaustedWall();
  if (botShouldWin(player)) return finishWin(playerId, "自摸胡");
  if (botShouldGang(player)) {
    const an = canAnGang(player)[0];
    const bu = canBuGang(player)[0];
    performGang(playerId, an ? "anGang" : "buGang", { id: an || bu });
    renderGame();
    await delay(BOT_DELAY);
    if (botShouldWin(player)) return finishWin(playerId, "杠后胡");
  }
  const discard = botChooseDiscard(player);
  discardTile(playerId, discard.uid);
  renderGame();
  await delay(300);
  if (await maybeWaitHumanResponse()) return;
  await continueAfterDiscard(playerId);
}

async function maybeWaitHumanResponse() {
  if (!state.lastDiscard || state.lastDiscard.by === "me") return false;
  const human = getHuman();
  const tile = state.lastDiscard.tile;
  const options = [];
  if (isWinningHand([...human.hand, tile], human.melds.length)) options.push("win");
  if (canMingGang(human, tile)) options.push("mingGang");
  if (canPeng(human, tile)) options.push("peng");
  if (options.length) {
    options.push("pass");
    state.actionOptions = options;
    state.status = "waitingHumanResponse";
    renderGame();
    return true;
  }
  return false;
}

function handleHumanAction(action) {
  const human = getHuman();
  if (action === "confirmDiscard") return confirmHumanDiscard();
  if (action === "cancel") {
    state.selectedUid = null;
    state.status = "waitingHumanDiscard";
    return renderGame();
  }
  if (action === "sort") {
    sortHand(human.hand);
    state.latestDrawNotice = null;
    window.clearTimeout(latestDrawTimer);
    return renderGame();
  }
  if (action === "win") return handleHumanWinClaim();
  if (action === "peng") {
    performPeng("me", state.lastDiscard.tile);
    return renderGame();
  }
  if (action === "mingGang") {
    performGang("me", "mingGang", state.lastDiscard.tile);
    state.status = "waitingHumanDiscard";
    return renderGame();
  }
  if (action === "anGang") {
    performGang("me", "anGang", { id: canAnGang(human)[0] });
    state.status = "waitingHumanDiscard";
    return renderGame();
  }
  if (action === "buGang") {
    performGang("me", "buGang", { id: canBuGang(human)[0] });
    state.status = "waitingHumanDiscard";
    return renderGame();
  }
  if (action === "pass") {
    const by = state.lastDiscard.by;
    state.actionOptions = [];
    state.status = "botThinking";
    renderGame();
    window.setTimeout(() => continueAfterDiscard(by), 300);
  }
}

function finishWin(playerId, winLabel) {
  const winner = getPlayer(playerId);
  state.status = "ended";
  state.winner = {
    playerId,
    label: winLabel,
    hand: [...winner.hand],
    melds: cloneMelds(winner.melds),
    type: getWinType(winner),
  };
  state.actionOptions = [];
  state.selectedUid = null;
  audio.play(playerId === "me" ? "win" : "lose");
  calculateFinalSettlement();
  renderGame();
  renderSettlementModal();
}

function getWinType(player) {
  if (player.melds.length === 0 && isSevenPairsWithRedJoker(player.hand)) return "七小对";
  const hasRed = player.hand.some((tile) => tile.isRedJoker);
  return hasRed ? "普通胡（红中万能辅助）" : "普通胡";
}

function cloneMelds(melds) {
  return melds.map((meld) => ({
    ...meld,
    tiles: [...meld.tiles],
  }));
}

function endExhaustedWall() {
  state.status = "ended";
  state.winner = null;
  state.settlement = { title: "牌墙耗尽，流局", prizeTiles: [], effectivePrizeTiles: [], prizePayEach: 0, moneyChanges: moneySnapshot() };
  renderGame();
  renderSettlementModal();
}

function calculateKongPayment() {
  return state.kongRecords.reduce((sum, record) => sum + record.amount, 0);
}

function drawPrizeTiles() {
  const prizes = [];
  for (let i = 0; i < 6; i++) {
    const tile = state.wall.pop();
    if (tile) prizes.push(tile);
  }
  return prizes;
}

function countEffectivePrizeTiles(prizeTiles) {
  return prizeTiles.filter((tile) => {
    if (tile.id === "wind-east" || tile.id === "dragon-red") return true;
    return ["wan", "tiao", "tong"].includes(tile.suit) && [1, 5, 9].includes(tile.rank);
  });
}

function calculateFinalSettlement() {
  const winner = getPlayer(state.winner.playerId);
  const prizeTiles = drawPrizeTiles();
  const effectivePrizeTiles = countEffectivePrizeTiles(prizeTiles);
  const prizePayEach = state.baseMoney * effectivePrizeTiles.length;
  const before = moneySnapshot();
  for (const player of state.players) {
    if (player.id === winner.id) continue;
    player.money -= prizePayEach;
    winner.money += prizePayEach;
  }
  state.settlement = {
    title: `${winner.name}${state.winner.label}`,
    winnerId: winner.id,
    winnerName: winner.name,
    winType: state.winner.type,
    winningHand: [...state.winner.hand],
    winningMelds: cloneMelds(state.winner.melds || []),
    baseMoney: state.baseMoney,
    prizeTiles,
    effectivePrizeTiles,
    prizePayEach,
    kongIncome: calculateKongPayment(),
    before,
    moneyChanges: moneySnapshot(),
    kongRecords: [...state.kongRecords],
  };
}

function moneySnapshot() {
  return Object.fromEntries(state.players.map((player) => [player.id, player.money]));
}

function renderGame() {
  const started = state.status !== "idle";
  els.emptyState.classList.toggle("hidden", started);
  els.gameBoard.classList.toggle("hidden", !started);
  els.restartBtn.disabled = !started;
  els.hintBtn.disabled = !started || state.status === "ended";
  els.endBtn.disabled = !started || state.status === "ended";
  els.hintBtn.textContent = state.showHint ? "收起提示" : "提示";
  renderTopStatus();
  renderScores();
  if (!started) return;
  renderWall();
  renderPlayers();
  renderHand();
  renderDiscards();
  renderMelds();
  renderActions();
  renderHintPanel();
}

function renderTopStatus() {
  const status = getStatusLabel();
  els.statusText.textContent = state.status === "idle"
    ? "等待开始"
    : `第 ${state.round} 局 · 第 ${state.turn} 巡 · ${status} · 剩余 ${state.wall.length} 张`;
  $("roundText").textContent = state.round;
  $("turnText").textContent = state.turn;
  $("wallText").textContent = state.wall.length;
  $("baseMoneyText").textContent = `${state.baseMoney}元`;
  $("phaseText").textContent = status;
}

function getStatusLabel() {
  if (state.status === "waitingHumanDiscard") return "等待我出牌";
  if (state.status === "humanConfirmDiscard") return "等待我确认出牌";
  if (state.status === "waitingHumanResponse") return "等待我选择碰杠胡";
  if (state.status === "botThinking") return `${PLAYER_NAME[PLAYER_ORDER[state.currentPlayerIndex]]}出牌中`;
  if (state.status === "ended") return "本局结束";
  return "等待开始";
}

function renderScores() {
  for (const player of state.players.length ? state.players : createPlayers()) {
    const el = $(`score${capitalize(player.id === "me" ? "self" : player.id)}`);
    if (el) el.textContent = `${player.name} ${player.money}元`;
  }
}

function renderWall() {
  const count = state.wall.length;
  const chunks = splitWall(count);
  for (const [id, amount] of Object.entries(chunks)) {
    const el = $(id);
    el.innerHTML = "";
    for (let i = 0; i < amount; i++) {
      const img = tileImageById("back", "牌墙");
      img.className = `wall-tile ${id === "wallBottom" && i === amount - 1 ? "draw-cursor" : ""}`;
      el.appendChild(img);
    }
  }
}

function splitWall(count) {
  const top = Math.ceil(count / 4);
  const right = Math.ceil((count - top) / 3);
  const bottom = Math.ceil((count - top - right) / 2);
  const left = Math.max(0, count - top - right - bottom);
  return { wallTop: top, wallRight: right, wallBottom: bottom, wallLeft: left };
}

function renderPlayers() {
  for (const id of ["right", "across", "left"]) {
    const player = getPlayer(id);
    $(`${id}Meta`).textContent = `${player.hand.length}张 · ${AI_LEVELS[player.aiLevel - 1].label}`;
    const handEl = $(`${id}Hand`);
    handEl.innerHTML = "";
    for (let i = 0; i < player.hand.length; i++) handEl.appendChild(tileImageById("back", "牌背"));
  }
  $("selfMeta").textContent = state.selectedUid
    ? `已选择 ${getHuman().hand.find((tile) => tile.uid === state.selectedUid)?.name || ""}`
    : state.status === "waitingHumanResponse"
      ? "请选择碰、杠、胡或过"
      : "请选择要打出的牌";
}

function renderHand() {
  const human = getHuman();
  const rec = state.showHint ? recommendDiscard(human)?.best?.tile?.uid : null;
  const handEl = $("myHand");
  handEl.innerHTML = "";
  const draggingUid = state.draggingUid;
  const tiles = draggingUid ? human.hand.filter((tile) => tile.uid !== draggingUid) : [...human.hand];
  let placeholderInserted = false;
  tiles.forEach((tile, index) => {
    if (draggingUid && state.dragInsertIndex === index) {
      handEl.appendChild(createDropGap());
      placeholderInserted = true;
    }
    handEl.appendChild(createHandTileButton(tile, rec, human.hand[human.hand.length - 1]?.uid));
  });
  if (draggingUid && !placeholderInserted) handEl.appendChild(createDropGap());
  handEl.ondragover = handleHandDragOver;
  handEl.ondrop = handleHandDrop;
  handEl.ondragend = handleHandDragEnd;
  handEl.ondragleave = handleHandDragLeave;
  renderDragPreview(rec, human.hand[human.hand.length - 1]?.uid);
}

function createHandTileButton(tile, recommendedUid, latestUid) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tile-btn";
  if (tile.uid === state.selectedUid) btn.classList.add("selected");
  if (tile.uid === recommendedUid) btn.classList.add("recommended");
  if (tile.uid === latestUid && state.status === "waitingHumanDiscard") btn.classList.add("fresh");
  if (tile.uid === state.latestDrawNotice?.uid) btn.classList.add("latest-draw");
  btn.title = tile.name;
  btn.dataset.uid = tile.uid;
  if (tile.uid === state.latestDrawNotice?.uid) {
    const badge = document.createElement("span");
    badge.className = "draw-badge";
    badge.textContent = state.latestDrawNotice.text;
    btn.appendChild(badge);
  }
  btn.appendChild(tileImage(tile));
  btn.addEventListener("pointerdown", (event) => handleHandPointerDown(event, tile.uid));
  btn.addEventListener("click", (event) => {
    if (state.dragPointer?.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    selectTile(tile.uid);
  });
  return btn;
}

function canDragHandTile() {
  return ["waitingHumanDiscard", "humanConfirmDiscard"].includes(state.status);
}

function createDropGap() {
  const gap = document.createElement("span");
  gap.className = "tile-gap active";
  return gap;
}

function handleHandPointerDown(event, uid) {
  if (!canDragHandTile() || event.button !== 0) return;
  const rect = event.currentTarget.getBoundingClientRect();
  state.dragPointer = {
    uid,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
    suppressClick: false,
  };
  window.addEventListener("pointermove", handleHandPointerMove);
  window.addEventListener("pointerup", handleHandPointerUp, { once: true });
}

function handleHandPointerMove(event) {
  const pointer = state.dragPointer;
  if (!pointer) return;
  const distance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
  if (!state.draggingUid && distance < 8) return;
  if (!state.draggingUid) {
    state.draggingUid = pointer.uid;
    state.dragInsertIndex = getHuman().hand.findIndex((tile) => tile.uid === pointer.uid);
    pointer.moved = true;
    pointer.suppressClick = true;
    if (state.selectedUid === pointer.uid) state.selectedUid = null;
    audio.play("lift");
    renderHand();
  }
  pointer.currentX = event.clientX;
  pointer.currentY = event.clientY;
  updateHandInsertIndex(event.clientX);
  updateDragPreviewPosition();
}

function handleHandPointerUp() {
  const pointer = state.dragPointer;
  window.removeEventListener("pointermove", handleHandPointerMove);
  if (!pointer) return;
  if (state.draggingUid) {
    finalizeHandDrag();
  } else if (!pointer.moved) {
    selectTile(pointer.uid);
  }
  removeDragPreview();
  window.setTimeout(() => {
    if (state.dragPointer) state.dragPointer.suppressClick = false;
    state.dragPointer = null;
  }, 0);
}

function handleHandDragStart(event, uid) {
  event.preventDefault();
}

function handleHandDragOver(event) {
  if (!state.draggingUid) return;
  event.preventDefault();
  updateHandInsertIndex(event.clientX);
}

function handleHandDrop(event) {
  if (!state.draggingUid) return;
  event.preventDefault();
  finalizeHandDrag();
}

function handleHandDragEnd() {
  if (!state.draggingUid) return;
  finalizeHandDrag();
}

function handleHandDragLeave(event) {
  if (!state.draggingUid) return;
  if (event.currentTarget.contains(event.relatedTarget)) return;
}

function finalizeHandDrag() {
  const human = getHuman();
  const fromIndex = human.hand.findIndex((tile) => tile.uid === state.draggingUid);
  if (fromIndex < 0) {
    state.draggingUid = null;
    state.dragInsertIndex = -1;
    return renderHand();
  }
  const [tile] = human.hand.splice(fromIndex, 1);
  let insertIndex = state.dragInsertIndex;
  if (insertIndex < 0) insertIndex = human.hand.length;
  if (insertIndex > human.hand.length) insertIndex = human.hand.length;
  human.hand.splice(insertIndex, 0, tile);
  state.draggingUid = null;
  state.dragInsertIndex = -1;
  audio.play("place");
  removeDragPreview();
  renderHand();
}

function updateHandInsertIndex(clientX) {
  const container = $("myHand");
  const buttons = [...container.querySelectorAll(".tile-btn:not(.dragging)")];
  let insertIndex = buttons.length;
  for (let i = 0; i < buttons.length; i++) {
    const rect = buttons[i].getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) {
      insertIndex = i;
      break;
    }
  }
  if (insertIndex !== state.dragInsertIndex) {
    state.dragInsertIndex = insertIndex;
    renderHand();
  }
}

function renderDiscards() {
  const pool = $("discardPool");
  pool.innerHTML = "";
  state.discardPool.forEach((item, index) => {
    const wrap = document.createElement("span");
    wrap.className = `discard-item ${index === state.discardPool.length - 1 ? "latest" : ""}`;
    wrap.innerHTML = `<span class="source-badge">${SOURCE_MARK[item.by]}</span>`;
    wrap.appendChild(tileImage(item.tile));
    pool.appendChild(wrap);
  });
}

function renderMelds() {
  for (const player of state.players) {
    const id = player.id === "me" ? "self" : player.id;
    const el = $(`${id}Melds`);
    el.innerHTML = "";
    for (const meld of player.melds) el.appendChild(renderMeld(meld));
  }
}

function renderMeld(meld) {
  const wrap = document.createElement("span");
  wrap.className = "meld";
  const label = document.createElement("span");
  label.className = "meld-label";
  label.textContent = ({ peng: "碰", mingGang: "明杠", anGang: "暗杠", buGang: "补杠" })[meld.type];
  wrap.appendChild(label);
  meld.tiles.forEach((tile, index) => {
    const img = meld.type === "anGang" && index < 2 ? tileImageById("back", "暗杠") : tileImage(tile);
    wrap.appendChild(img);
  });
  return wrap;
}

function renderActions() {
  const bar = els.actionBar;
  bar.innerHTML = "";
  const add = (label, action, primary = false) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.className = primary ? "primary" : "ghost";
    btn.addEventListener("click", () => handleHumanAction(action));
    bar.appendChild(btn);
  };
  if (state.status === "humanConfirmDiscard") {
    add("确认打出", "confirmDiscard", true);
    add("取消选择", "cancel");
  }
  if (["waitingHumanDiscard", "humanConfirmDiscard"].includes(state.status)) {
    add("我胡了", "win");
    for (const id of canAnGang(getHuman())) add(`暗杠 ${TILE_BY_ID[id].name}`, "anGang");
    for (const id of canBuGang(getHuman())) add(`补杠 ${TILE_BY_ID[id].name}`, "buGang");
    add("整理手牌", "sort");
  }
  if (state.status === "waitingHumanResponse") {
    if (state.actionOptions.includes("win")) add("胡", "win", true);
    if (state.actionOptions.includes("mingGang")) add("杠", "mingGang");
    if (state.actionOptions.includes("peng")) add("碰", "peng");
    add("过", "pass");
  }
  bar.classList.toggle("hidden", !bar.children.length);
}

function renderHintPanel() {
  const panel = els.hintPanel;
  const human = getHuman();
  panel.classList.toggle("hidden", !state.showHint || state.status === "ended" || state.status === "idle");
  if (panel.classList.contains("hidden")) return;
  if (state.status === "waitingHumanResponse" && state.lastDiscard) {
    const rec = recommendPengOrPass(human, state.lastDiscard.tile);
    panel.innerHTML = `<h2>响应提示</h2><div class="hint-card"><p>当前可以考虑 ${state.lastDiscard.tile.name}。建议：${rec.action === "peng" ? "可以碰" : "先过"}。${rec.reason}</p></div>`;
    return;
  }
  const rec = recommendDiscard(human);
  const sh = calculateBestShanten(human.hand, human.melds.length);
  if (!rec) {
    panel.innerHTML = `<h2>提示</h2><div class="hint-card"><p>当前暂无可分析手牌。</p></div>`;
    return;
  }
  const best = rec.best;
  const eff = best.effectiveDraws.slice(0, 10).map((id) => TILE_BY_ID[id].name).join("、") || "暂无明显进张";
  panel.innerHTML = `
    <h2>建议打出：${best.tile.name}</h2>
    <div class="hint-grid">
      <div class="hint-card">
        <p>${best.reason}</p>
        <p>当前路线：${sh.route}；向听：${sh.shanten}；风险：${best.risk}。</p>
        <p>有效进张：${eff}</p>
      </div>
      <div class="candidate-list">
        ${rec.candidates.slice(0, 5).map((item) => `
          <div class="candidate-row">
            <div class="candidate-main">${tileImageHtml(item.tile)}<div><strong>${item.tile.name}</strong><p>${item.reason}</p></div></div>
            <span class="pill">${Math.round(item.score)} · ${item.risk}</span>
          </div>
        `).join("")}
      </div>
    </div>`;
}

function renderRuleModal() {
  els.rulesDialog.showModal();
}

function renderSettlementModal() {
  const s = state.settlement;
  if (!s) {
    els.settlementContent.innerHTML = `
      <div class="settle-card">本局暂无胡牌结算。</div>
      <div class="settle-card"><b>杠牌记录</b><br>${state.kongRecords.map((r) => r.text).join("<br>") || "暂无杠牌收入"}</div>
      <div class="money-grid">${state.players.map((p) => `<div>${p.name}<br><b>${p.money}元</b></div>`).join("")}</div>
    `;
    els.settlementDialog.showModal();
    return;
  }
  const winningHand = [...(s.winningHand || [])];
  sortHand(winningHand);
  els.settlementContent.innerHTML = `
    <div class="settle-card"><b>${s.title}</b><br>牌型：${s.winType || "流局"}；底钱：${s.baseMoney || state.baseMoney} 元</div>
    <div class="settle-card">
      <b>${s.winnerName || PLAYER_NAME[s.winnerId]}胡牌展示</b>
      <div class="winner-hand-block">
        ${s.winningMelds?.length ? `<div class="winner-line"><span class="winner-label">明牌</span><div class="winner-tiles">${s.winningMelds.map((meld) => renderMeldHtml(meld)).join("")}</div></div>` : ""}
        <div class="winner-line"><span class="winner-label">手牌</span><div class="winner-tiles">${winningHand.map((tile) => tileImageHtml(tile)).join("") || "无"}</div></div>
      </div>
    </div>
    <div class="settle-card">
      <b>奖牌 6 张</b>
      <div class="prize-row">${s.prizeTiles.map((tile) => tileImageHtml(tile)).join("") || "无"}</div>
      <p>有效奖牌：${s.effectivePrizeTiles.map((tile) => tile.name).join("、") || "0 张"}；每家奖牌赔付：${s.prizePayEach || 0} 元</p>
    </div>
    <div class="settle-card"><b>杠牌收入</b><br>${s.kongRecords?.map((r) => r.text).join("<br>") || "暂无杠牌收入"}</div>
    <div class="money-grid">${state.players.map((p) => `<div>${p.name}<br><b>${p.money}元</b></div>`).join("")}</div>
  `;
  els.settlementDialog.showModal();
}

function renderMeldHtml(meld) {
  return `
    <span class="meld">
      <span class="meld-label">${({ peng: "碰", mingGang: "明杠", anGang: "暗杠", buGang: "补杠" })[meld.type]}</span>
      ${meld.tiles.map((tile, index) => meld.type === "anGang" && index < 2 ? '<img class="tile-img" src="assets/tiles/back.png" alt="暗杠" draggable="false">' : tileImageHtml(tile)).join("")}
    </span>
  `;
}

function tileImage(tile) {
  const img = document.createElement("img");
  img.className = "tile-img";
  img.src = tile.img;
  img.alt = tile.name;
  img.draggable = false;
  return img;
}

function tileImageById(id, alt = "牌背") {
  const img = document.createElement("img");
  img.className = "tile-img";
  img.src = id === "back" ? "assets/tiles/back.png" : TILE_BY_ID[id].img;
  img.alt = alt;
  img.draggable = false;
  return img;
}

function tileImageHtml(tileOrId) {
  const tile = typeof tileOrId === "string" ? TILE_BY_ID[tileOrId] : tileOrId;
  return `<img class="tile-img" src="${tile.img}" alt="${tile.name}" draggable="false">`;
}

function renderDragPreview(recommendedUid, latestUid) {
  removeDragPreview();
  if (!state.draggingUid || !state.dragPointer) return;
  const tile = getHuman().hand.find((item) => item.uid === state.draggingUid);
  if (!tile) return;
  const preview = createHandTileButton(tile, recommendedUid, latestUid);
  preview.classList.add("drag-preview");
  preview.style.position = "fixed";
  preview.style.left = "0";
  preview.style.top = "0";
  preview.style.zIndex = "120";
  preview.style.pointerEvents = "none";
  preview.dataset.dragPreview = "true";
  document.body.appendChild(preview);
  updateDragPreviewPosition();
}

function updateDragPreviewPosition() {
  const preview = document.querySelector("[data-drag-preview='true']");
  const pointer = state.dragPointer;
  if (!preview || !pointer) return;
  preview.style.transform = `translate(${pointer.currentX - pointer.offsetX}px, ${pointer.currentY - pointer.offsetY - 10}px) rotate(-2deg)`;
}

function removeDragPreview() {
  document.querySelector("[data-drag-preview='true']")?.remove();
}

function createAudioEngine() {
  const stateAudio = { ctx: null };
  const ensure = () => {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!stateAudio.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      stateAudio.ctx = new AudioCtx();
    }
    if (stateAudio.ctx.state === "suspended") stateAudio.ctx.resume();
    return stateAudio.ctx;
  };
  const tone = (ctx, { freq = 440, duration = 0.08, type = "sine", gain = 0.03, attack = 0.005, decay = 0.06, when = 0 }) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
    amp.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + when + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + duration + decay);
    osc.connect(amp).connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration + decay + 0.02);
  };
  const patterns = {
    start: (ctx) => {
      tone(ctx, { freq: 392, duration: 0.07, type: "triangle", gain: 0.035 });
      tone(ctx, { freq: 523, duration: 0.09, type: "triangle", gain: 0.032, when: 0.08 });
    },
    select: (ctx) => tone(ctx, { freq: 660, duration: 0.04, type: "triangle", gain: 0.018 }),
    lift: (ctx) => tone(ctx, { freq: 720, duration: 0.05, type: "square", gain: 0.016 }),
    place: (ctx) => tone(ctx, { freq: 320, duration: 0.05, type: "triangle", gain: 0.022 }),
    drawMe: (ctx) => tone(ctx, { freq: 480, duration: 0.05, type: "triangle", gain: 0.015 }),
    drawBot: (ctx) => tone(ctx, { freq: 410, duration: 0.04, type: "triangle", gain: 0.01 }),
    gangDraw: (ctx) => {
      tone(ctx, { freq: 520, duration: 0.05, type: "triangle", gain: 0.018 });
      tone(ctx, { freq: 620, duration: 0.06, type: "triangle", gain: 0.016, when: 0.06 });
    },
    discardMe: (ctx) => {
      tone(ctx, { freq: 260, duration: 0.04, type: "triangle", gain: 0.024 });
      tone(ctx, { freq: 210, duration: 0.05, type: "triangle", gain: 0.02, when: 0.03 });
    },
    discardBot: (ctx) => tone(ctx, { freq: 220, duration: 0.04, type: "triangle", gain: 0.015 }),
    peng: (ctx) => {
      tone(ctx, { freq: 392, duration: 0.05, type: "square", gain: 0.02 });
      tone(ctx, { freq: 392, duration: 0.05, type: "square", gain: 0.02, when: 0.06 });
    },
    gang: (ctx) => {
      tone(ctx, { freq: 240, duration: 0.06, type: "sawtooth", gain: 0.02 });
      tone(ctx, { freq: 320, duration: 0.07, type: "sawtooth", gain: 0.02, when: 0.07 });
      tone(ctx, { freq: 420, duration: 0.08, type: "triangle", gain: 0.018, when: 0.14 });
    },
    win: (ctx) => {
      tone(ctx, { freq: 523, duration: 0.08, type: "triangle", gain: 0.03 });
      tone(ctx, { freq: 659, duration: 0.09, type: "triangle", gain: 0.03, when: 0.08 });
      tone(ctx, { freq: 784, duration: 0.14, type: "triangle", gain: 0.028, when: 0.18 });
    },
    lose: (ctx) => {
      tone(ctx, { freq: 294, duration: 0.08, type: "sine", gain: 0.02 });
      tone(ctx, { freq: 247, duration: 0.1, type: "sine", gain: 0.02, when: 0.09 });
      tone(ctx, { freq: 196, duration: 0.14, type: "sine", gain: 0.02, when: 0.2 });
    },
  };
  return {
    play(name) {
      const ctx = ensure();
      if (!ctx || !patterns[name]) return;
      patterns[name](ctx);
    },
  };
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

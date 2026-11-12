const columns = 7;
const rows = 4;
const walls = new Set([1, 8, 12, 17]);
const disks = [23, 10, 6];
const directions = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};
const intro = document.querySelector('#arcade-intro');
const game = document.querySelector('#memory-run');
const play = document.querySelector('#play-memory');
const replay = document.querySelector('#replay-memory');
const board = document.querySelector('#game-board');
const tiles = document.querySelector('#game-tiles');
const player = document.querySelector('#game-player');
const disk = document.querySelector('#game-disk');
const score = document.querySelector('#game-score');
const help = document.querySelector('#game-help');
const announcement = document.querySelector('#game-announcement');
const controls = game.querySelector('.game-directions');
let position;
let collected;

function place(element, index) {
  element.style.gridArea = (Math.floor(index / columns) + 1) + ' / ' + (index % columns + 1);
}

for (let index = 0; index < columns * rows; index++) {
  const tile = document.createElement('span');
  tile.className = walls.has(index) ? 'game-tile game-wall' : 'game-tile';
  place(tile, index);
  tiles.prepend(tile);
}

function coordinates(index) {
  return 'row ' + (Math.floor(index / columns) + 1) + ', column ' + (index % columns + 1);
}

function render() {
  const won = collected === disks.length;
  place(player, position);
  disk.hidden = won;
  if (!won) place(disk, disks[collected]);
  score.textContent = 'Disks ' + collected + '/' + disks.length;
  controls.hidden = won;
  replay.hidden = !won;
  help.textContent = won ? 'All three disks collected!' : 'Collect three disks with the arrow keys or on-screen controls.';
  announcement.textContent = won ? help.textContent :
    score.textContent + '. You are at ' + coordinates(position) + '. Next disk at ' + coordinates(disks[collected]) + '.';
}

function start() {
  position = columns * (rows - 1);
  collected = 0;
  intro.hidden = true;
  game.hidden = false;
  play.setAttribute('aria-expanded', 'true');
  render();
  board.focus();
}

function exit() {
  game.hidden = true;
  intro.hidden = false;
  play.setAttribute('aria-expanded', 'false');
  play.focus();
}

function move(key) {
  if (collected === disks.length) return;
  const [dx, dy] = directions[key];
  const x = position % columns + dx;
  const y = Math.floor(position / columns) + dy;
  const next = y * columns + x;
  if (x < 0 || x >= columns || y < 0 || y >= rows || walls.has(next)) {
    announcement.textContent = 'Blocked at ' + coordinates(position) + '. Try a different direction.';
    return;
  }
  position = next;
  if (position === disks[collected]) collected++;
  render();
  if (collected === disks.length) replay.focus();
}

play.addEventListener('click', start);
replay.addEventListener('click', start);
document.querySelector('#exit-memory').addEventListener('click', exit);
for (const button of controls.querySelectorAll('[data-move]')) {
  button.addEventListener('click', () => move(button.dataset.move));
}
game.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    event.preventDefault();
    exit();
  } else if (Object.hasOwn(directions, event.key)) {
    event.preventDefault();
    move(event.key);
  }
});

/** Draws a small "photo of a notebook page" so the demo can send a real image to the bot. */
export function fakeNotebookPhoto(): string {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 300;
  const g = c.getContext('2d');
  if (!g) return 'data:image/png;base64,';
  g.fillStyle = '#fbf8f1';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#c9d8f0';
  for (let y = 40; y < c.height; y += 22) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  g.strokeStyle = '#f0b4b4';
  g.beginPath();
  g.moveTo(34, 0);
  g.lineTo(34, c.height);
  g.stroke();
  g.fillStyle = '#26348a';
  g.font = 'italic 15px Georgia, serif';
  const lines = ['Homework — Unit 5', 'I went to school.', 'She played tennis.', 'They watched a film.', 'We visited Samarkand.', 'He did his homework.', 'It rained yesterday.', '... 20/20 ✓'];
  lines.forEach((l, i) => g.fillText(l, 42, 35 + i * 22));
  return c.toDataURL('image/png');
}

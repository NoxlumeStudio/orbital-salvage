/* Player-facing chapter labels. Internal stage/save identifiers are deliberately unchanged. */
(() => {
  const entries = Object.freeze({
    prologue: Object.freeze({ number: 1, title: '小さな形見' }),
    chapter4: Object.freeze({ number: 2, title: '忘れられた居住区' }),
    arcade: Object.freeze({ number: 3, title: '忘れられたヒーロー' }),
    freighter: Object.freeze({ number: 4, title: '届けられなかった手紙' }),
  });
  const number = id => entries[id]?.number;
  const japanese = id => number(id) ? `第${number(id)}章` : id === 'epilogue' ? 'エピローグ' : '';
  const english = id => number(id) ? `CHAPTER ${String(number(id)).padStart(2, '0')}` : id === 'epilogue' ? 'EPILOGUE' : '';
  const title = id => entries[id]?.title || '';
  const name = id => `${japanese(id)}「${title(id)}」`;
  // Convert only presentation strings, never internal scene IDs, storage keys, or branching logic.
  const sceneLabel = label => String(label || '')
    .replace(/CHAPTER 04\b/g, english('chapter4'))
    .replace(/CHAPTER 05\b/g, english('arcade'))
    .replace(/CHAPTER 06\b/g, english('freighter'));
  window.chapterDisplay = Object.freeze({ entries, number, japanese, english, title, name, sceneLabel });
})();

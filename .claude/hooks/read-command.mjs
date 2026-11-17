// A reading is trusted only where it is certain: plain words, quoted strings and separators, with
// nothing a shell would expand, substitute, escape or comment out. For anything else the reader
// gives up, and the hooks check the raw text, which hides nothing. Where PowerShell splits words
// differently from Bash, the reader follows it: a curly quote closes a string, two quotes in a row
// are one quote, a word that begins with a quote ends at its closing quote, and a literal here-string
// opens only after a blank and ends at the first line that starts with its closing quote.
const SINGLE = String.raw`'\u2018-\u201b`;
const DOUBLE = String.raw`"\u201c-\u201e`;

function tokens(separator, part, hereString) {
  const kinds = [
    '(?<blank> +)',
    `(?<separator>${separator})`,
    String.raw`(?<redirect>\d?>&\d)`,
    ...(hereString ? [`(?<hereString>${hereString})`] : []),
    `(?<part>${part})`,
  ];
  return new RegExp(kinds.join('|'), 'y');
}

const TOKEN = {
  Bash: tokens(String.raw`&&|[;|\n]`, String.raw`[\w./:=-]+|'[^']*'|"[^"$\x60\\]*"`),
  PowerShell: tokens(
    String.raw`&&|[;|\r\n]`,
    String.raw`[\w./\\:=-]+|'(?:[^${SINGLE}]|[${SINGLE}]{2})*[${SINGLE}]|"(?:[^${DOUBLE}$\x60]|[${DOUBLE}]{2})*[${DOUBLE}]`,
    String.raw`@'[ \t]*\r?\n(?:[\s\S]*?[\r\n])??[${SINGLE}]@`,
  ),
};
const ESCAPED_SINGLE_QUOTE = new RegExp(`[${SINGLE}]([${SINGLE}])`, 'g');
const PARAMETER_WITH_VALUE = /^(-[A-Za-z][^:]*:)([\s\S]+)$/;
const GIT = /^git(\.exe)?$/i;
const GIT_OPTION_WITH_VALUE = /^(-C|-c|--git-dir|--work-tree|--namespace|--config-env)$/;
const GIT_LOCATION_OPTION = /^(-C|--git-dir|--work-tree)(=|$)/;

function valueOf(kind, text) {
  if (kind === 'hereString') return text.slice(text.indexOf('\n') + 1, -2).replace(/\r?\n$/, '');
  if (text[0] === "'") return text.slice(1, -1).replace(ESCAPED_SINGLE_QUOTE, '$1');
  return text[0] === '"' ? text.slice(1, -1) : text;
}

// Windows PowerShell 5.1 hands a program other arguments than it parsed: it splits -name:value,
// drops an empty argument, and does not escape a double quote or a final backslash. A word it would
// change makes the reading uncertain.
function handedOver(commands) {
  const split = ({ value }) => PARAMETER_WITH_VALUE.exec(value)?.slice(1) ?? [value];
  const handed = commands.map((words) => words.flatMap(split));
  return handed.flat().some((value) => value === '' || value.includes('"') || value.endsWith('\\')) ? null : handed;
}

export function readCommands(command, shell) {
  const token = TOKEN[shell];
  const powerShell = shell === 'PowerShell';
  token.lastIndex = 0;
  const commands = [[]];
  let previous;
  while (token.lastIndex < command.length) {
    const match = token.exec(command);
    if (!match) return null;
    const [kind, text] = Object.entries(match.groups).find(([, value]) => value !== undefined);
    if (kind === 'hereString' && previous !== 'blank') return null;
    if (kind === 'separator') commands.push([]);
    if (kind === 'part' || kind === 'hereString') {
      const words = commands.at(-1);
      const last = words.at(-1);
      if (previous === 'part' && (last.bare || !powerShell)) last.value += valueOf(kind, text);
      else words.push({ value: valueOf(kind, text), bare: !/^['"]/.test(text) });
    }
    previous = kind;
  }
  return powerShell ? handedOver(commands) : commands.map((words) => words.map(({ value }) => value));
}

export function readGit(words) {
  const at = words.findIndex((word) => GIT.test(word));
  if (at === -1) return null;
  let next = at + 1;
  const location = [];
  while (words[next]?.startsWith('-')) {
    const step = GIT_OPTION_WITH_VALUE.test(words[next]) ? 2 : 1;
    if (GIT_LOCATION_OPTION.test(words[next])) location.push(...words.slice(next, next + step));
    next += step;
  }
  return { at, location, commit: words[next] === 'commit', options: words.slice(next + 1) };
}

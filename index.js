#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';

// ---------- Константи ----------
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAYS_UA = {
  monday: 'Понеділок', tuesday: 'Вівторок', wednesday: 'Середа',
  thursday: 'Четвер', friday: 'П\'ятниця', saturday: 'Субота', sunday: 'Неділя',
};
const PARITIES = ['numerator', 'denominator'];
const WEEK_TYPES_UA = { everyWeek: 'щотижня', numerator: 'чисельник', denominator: 'знаменник' };

// ---------- Власна помилка ----------
class CliError extends Error {}

// ---------- Парсери аргументів ----------
function parsePositiveInt(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new CliError(`"${value}" не є додатним цілим числом.`);
  }
  return Number(value);
}

function parseDay(value) {
  const day = value.toLowerCase();
  if (!DAYS.includes(day)) {
    throw new CliError(`Невідомий день "${value}". Допустимі значення: ${DAYS.join(', ')}.`);
  }
  return day;
}

function parseParity(value) {
  const parity = value.toLowerCase();
  if (!PARITIES.includes(parity)) {
    throw new CliError(`Невідомий тиждень "${value}". Допустимі значення: ${PARITIES.join(', ')}.`);
  }
  return parity;
}

// ---------- Читання даних ----------
function loadData(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new CliError(`Файл "${path}" не знайдено.`);
    if (err.code === 'EISDIR') throw new CliError(`"${path}" є текою, а не файлом.`);
    throw new CliError(`Не вдалося прочитати файл "${path}": ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new CliError(`Файл "${path}" містить некоректний JSON: ${err.message}`);
  }

  if (data === null || typeof data !== 'object' || !Array.isArray(data.lessons)) {
    throw new CliError(`У файлі "${path}" немає масиву "lessons".`);
  }
  return data;
}

// Повертає заняття разом з їхнім номером у файлі (нумерація з 1)
function getEntries(command) {
  const { file } = command.optsWithGlobals();
  return loadData(file).lessons.map((lesson, index) => ({ number: index + 1, lesson }));
}

// ---------- Форматування ----------
function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    DAYS.indexOf(String(a.lesson.day).toLowerCase()) - DAYS.indexOf(String(b.lesson.day).toLowerCase()) ||
    String(a.lesson.startTime).localeCompare(String(b.lesson.startTime)));
}

function formatShort({ number, lesson: l }) {
  const day = DAYS_UA[String(l.day).toLowerCase()] ?? l.day;
  const place = l.format === 'online' ? 'онлайн' : `ауд. ${l.room ?? '—'}`;
  const weekType = WEEK_TYPES_UA[l.weekType] ?? l.weekType;
  return `${number}. ${day} ${l.date}, ${l.startTime}-${l.endTime} | ${l.subject} | ${l.teacher} | ${place} | ${weekType}`;
}

function printEntries(entries, emptyMessage) {
  if (entries.length === 0) {
    console.log(emptyMessage);
    return;
  }
  sortEntries(entries).forEach((e) => console.log(formatShort(e)));
}

// ---------- Шлях до поля ----------
function getByPath(obj, path) {
  let current = obj;
  for (const key of path.split('.')) {
    if (current !== null && typeof current === 'object' && Object.hasOwn(current, key)) {
      current = current[key];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}

// ---------- Програма ----------
const program = new Command();

program
  .name('schedule')
  .description('Консольна програма для перегляду розкладу занять з JSON-файлу')
  .version('1.0.0', '-v, --version', 'Показати версію програми')
  .helpOption('-h, --help', 'Показати довідку')
  .addHelpCommand('help [command]', 'Показати довідку для команди')
  .option('-f, --file <path>', 'Шлях до JSON-файлу з розкладом', 'data.json')
  .exitOverride()
  .configureOutput({ outputError: () => {} });

program
  .command('list')
  .description('Показати стислий список занять')
  .option('-l, --limit <n>', 'Максимальна кількість занять у списку', parsePositiveInt)
  .action((options, command) => {
    let entries = sortEntries(getEntries(command));
    if (options.limit !== undefined) entries = entries.slice(0, options.limit);
    printEntries(entries, 'Занять не знайдено.');
  });
program
  .command('show')
  .description('Показати одне заняття повністю (за номером у файлі)')
  .argument('<number>', 'Номер заняття (нумерація з 1, див. команду list)', parsePositiveInt)
  .action((number, options, command) => {
    const entries = getEntries(command);
    const entry = entries.find((e) => e.number === number);
    if (!entry) throw new CliError(`Заняття №${number} не існує (усього занять: ${entries.length}).`);
    console.log(JSON.stringify(entry.lesson, null, 2));
  });

program
  .command('field')
  .description('Показати значення окремого поля заняття (шлях через крапку)')
  .argument('<number>', 'Номер заняття (нумерація з 1)', parsePositiveInt)
  .argument('<path>', 'Назва поля, наприклад teacher, room або startTime')
  .action((number, path, options, command) => {
    const entries = getEntries(command);
    const entry = entries.find((e) => e.number === number);
    if (!entry) throw new CliError(`Заняття №${number} не існує (усього занять: ${entries.length}).`);
    const result = getByPath(entry.lesson, path);
    if (!result.found) throw new CliError(`У занятті №${number} немає поля "${path}".`);
    console.log(typeof result.value === 'object' && result.value !== null
      ? JSON.stringify(result.value, null, 2)
      : String(result.value));
  });
  program
  .command('day')
  .description('Показати заняття за обраний день тижня')
  .argument('<day>', `День тижня: ${DAYS.join(', ')}`, parseDay)
  .action((day, options, command) => {
    const entries = getEntries(command).filter((e) => String(e.lesson.day).toLowerCase() === day);
    printEntries(entries, `На ${DAYS_UA[day].toLowerCase()} занять немає.`);
  });
  program
  .command('teacher')
  .description('Показати заняття викладача (пошук за частиною імені)')
  .argument('<name>', 'Частина імені викладача, наприклад melnyk')
  .option('-o, --online-only', 'Показати лише дистанційні заняття')
  .action((name, options, command) => {
    const needle = name.toLowerCase();
    let entries = getEntries(command).filter((e) =>
      String(e.lesson.teacher ?? '').toLowerCase().includes(needle));
    if (options.onlineOnly) entries = entries.filter((e) => e.lesson.format === 'online');
    printEntries(entries, `Занять викладача "${name}" не знайдено.`);
  });
// ---------- Обробка помилок ----------

function quoted(message) {
  return message.match(/'([^']+)'/)?.[1] ?? '';
}

function handleError(err) {
  if (err instanceof CliError) {
    console.error(`Помилка: ${err.message}`);
    process.exit(1);
  }
  if (err.code?.startsWith('commander.')) {
    if (['commander.helpDisplayed', 'commander.version', 'commander.help'].includes(err.code)) {
      process.exit(err.exitCode);
    }
    const messages = {
      'commander.unknownOption': `Невідома опція "${quoted(err.message)}".`,
      'commander.unknownCommand': `Невідома команда "${quoted(err.message)}".`,
      'commander.missingArgument': `Пропущено обов'язковий аргумент <${quoted(err.message)}>.`,
      'commander.optionMissingArgument': 'Опції не вказано значення.',
      'commander.excessArguments': 'Забагато аргументів.',
    };
    console.error(`Помилка: ${messages[err.code] ?? 'Некоректний виклик.'} Див. --help.`);
    process.exit(1);
  }
  console.error(`Непередбачена помилка: ${err.message}`);
  process.exit(1);
}

try {
  program.parse();
} catch (err) {
  handleError(err);
}
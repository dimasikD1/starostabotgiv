export function seedData() {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const users = [
    {
      id: 'user-1',
      name: 'Дмитрий Дунаев',
      username: '@dima_starosta',
      role: 'starosta',
      roleTitle: 'Староста 1 п/гр',
      subgroup: 1,
      phone: '+7 (999) 234-56-78',
      telegram: '@dima_starosta',
    },
    {
      id: 'user-2',
      name: 'Анна Сергеева',
      username: '@anya_starosta2',
      role: 'starosta',
      roleTitle: 'Староста 2 п/гр',
      subgroup: 2,
      phone: '+7 (916) 345-67-89',
      telegram: '@anya_starosta2',
    },
    {
      id: 'user-3',
      name: 'Максим Ковалёв',
      username: '@max_koval',
      role: 'proforg',
      roleTitle: 'Профорг',
      subgroup: 1,
      phone: '+7 (925) 456-78-90',
      telegram: '@max_koval',
    },
    {
      id: 'user-4',
      name: 'Екатерина Морозова',
      username: '@kate_moroz',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 1,
      phone: '+7 (903) 567-89-01',
      telegram: '@kate_moroz',
    },
    {
      id: 'user-5',
      name: 'Артём Васильев',
      username: '@artem_v',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 2,
      phone: '+7 (985) 678-90-12',
      telegram: '@artem_v',
    },
    {
      id: 'user-6',
      name: 'София Лебедева',
      username: '@sofia_leb',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 1,
      phone: '+7 (915) 789-01-23',
      telegram: '@sofia_leb',
    },
    {
      id: 'user-7',
      name: 'Илья Романов',
      username: '@ilya_code',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 2,
      phone: '+7 (926) 890-12-34',
      telegram: '@ilya_code',
    },
    {
      id: 'user-8',
      name: 'Полина Смирнова',
      username: '@polina_sm',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 1,
      phone: '+7 (977) 901-23-45',
      telegram: '@polina_sm',
    },
    {
      id: 'user-9',
      name: 'Кирилл Новиков',
      username: '@kirill_nov',
      role: 'student',
      roleTitle: 'Студент',
      subgroup: 2,
      phone: '+7 (995) 012-34-56',
      telegram: '@kirill_nov',
    },
    {
      id: 'user-10',
      name: 'Михаил Воронов',
      username: '@prof_voronov',
      role: 'curator',
      roleTitle: 'Куратор',
      subgroup: 1,
      phone: '+7 (495) 123-45-00',
      telegram: '@prof_voronov',
    },
  ];

  const schedule = [
    // Понедельник
    { id: 'mon-1', dayOfWeek: 1, pairNumber: 1, timeStart: '08:30', timeEnd: '10:00', subject: 'Корпоративные информационные системы', type: 'lecture', teacher: 'проф. Савицкий В.К.', auditorium: '412', subgroup: null },
    { id: 'mon-2-1', dayOfWeek: 1, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Базы данных (лаб.)', type: 'lab', teacher: 'доц. Кубанская Е.Н.', auditorium: '305', subgroup: 1 },
    { id: 'mon-2-2', dayOfWeek: 1, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Веб-разработка (практ.)', type: 'practice', teacher: 'ст. преп. Орлова А.С.', auditorium: '204', subgroup: 2 },
    { id: 'mon-3-1', dayOfWeek: 1, pairNumber: 3, timeStart: '12:15', timeEnd: '13:45', subject: 'Веб-разработка (практ.)', type: 'practice', teacher: 'ст. преп. Орлова А.С.', auditorium: '204', subgroup: 1 },
    { id: 'mon-3-2', dayOfWeek: 1, pairNumber: 3, timeStart: '12:15', timeEnd: '13:45', subject: 'Базы данных (лаб.)', type: 'lab', teacher: 'доц. Кубанская Е.Н.', auditorium: '305', subgroup: 2 },
    // Вторник
    { id: 'tue-1', dayOfWeek: 2, pairNumber: 1, timeStart: '08:30', timeEnd: '10:00', subject: 'Теория вероятностей', type: 'lecture', teacher: 'проф. Белов И.А.', auditorium: '310', subgroup: null },
    { id: 'tue-2', dayOfWeek: 2, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Иностранный язык', type: 'practice', teacher: 'доц. Смит Е.В.', auditorium: '118', subgroup: 1 },
    { id: 'tue-3', dayOfWeek: 2, pairNumber: 3, timeStart: '12:15', timeEnd: '13:45', subject: 'Архитектура ЭВМ', type: 'lab', teacher: 'доц. Громов П.С.', auditorium: '301', subgroup: 2 },
    // Среда
    { id: 'wed-1', dayOfWeek: 3, pairNumber: 1, timeStart: '08:30', timeEnd: '10:00', subject: 'Базы данных', type: 'lecture', teacher: 'доц. Кубанская Е.Н.', auditorium: '412', subgroup: null },
    { id: 'wed-2', dayOfWeek: 3, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Физическая культура', type: 'practice', teacher: 'ст. преп. Зайцев А.А.', auditorium: 'Спортзал', subgroup: null },
    { id: 'wed-3', dayOfWeek: 3, pairNumber: 3, timeStart: '12:15', timeEnd: '13:45', subject: 'Веб-разработка', type: 'lecture', teacher: 'ст. преп. Орлова А.С.', auditorium: '204', subgroup: null },
    // Четверг
    { id: 'thu-1', dayOfWeek: 4, pairNumber: 1, timeStart: '08:30', timeEnd: '10:00', subject: 'Экономика', type: 'lecture', teacher: 'доц. Мельник О.Ю.', auditorium: '215', subgroup: null },
    { id: 'thu-2', dayOfWeek: 4, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Архитектура ЭВМ', type: 'lecture', teacher: 'доц. Громов П.С.', auditorium: '301', subgroup: null },
    { id: 'thu-3', dayOfWeek: 4, pairNumber: 3, timeStart: '12:15', timeEnd: '13:45', subject: 'Иностранный язык', type: 'practice', teacher: 'доц. Смит Е.В.', auditorium: '118', subgroup: 2 },
    // Пятница
    { id: 'fri-1', dayOfWeek: 5, pairNumber: 1, timeStart: '08:30', timeEnd: '10:00', subject: 'Теория вероятностей', type: 'practice', teacher: 'проф. Белов И.А.', auditorium: '310', subgroup: null },
    { id: 'fri-2', dayOfWeek: 5, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Корпоративные информационные системы', type: 'lab', teacher: 'проф. Савицкий В.К.', auditorium: '305', subgroup: null },
    { id: 'fri-3', dayOfWeek: 5, pairNumber: 3, timeStart: '12:15', timeEnd: '13:45', subject: 'Кураторский час', type: 'practice', teacher: 'доц. Воронов М.И.', auditorium: '312', subgroup: null },
    // Суббота
    { id: 'sat-1', dayOfWeek: 6, pairNumber: 1, timeStart: '08:30', timeEnd: '10:00', subject: 'Физическая культура', type: 'practice', teacher: 'ст. преп. Зайцев А.А.', auditorium: 'Спортзал', subgroup: null },
    { id: 'sat-2', dayOfWeek: 6, pairNumber: 2, timeStart: '10:15', timeEnd: '11:45', subject: 'Экономика', type: 'practice', teacher: 'доц. Мельник О.Ю.', auditorium: '215', subgroup: null },
  ];

  const homework = [
    {
      id: 'hw-1',
      subject: 'Базы данных',
      title: 'Лабораторная №3: индексы и триггеры в PostgreSQL',
      deadline: shift(today, 3),
      priority: 'important',
      completedByUserIds: ['user-1', 'user-2', 'user-4', 'user-8'],
    },
    {
      id: 'hw-2',
      subject: 'Веб-разработка',
      title: 'REST API + авторизация JWT',
      deadline: shift(today, 7),
      priority: 'normal',
      completedByUserIds: ['user-1', 'user-7'],
    },
    {
      id: 'hw-3',
      subject: 'Теория вероятностей',
      title: 'РГР: доверительные интервалы (варианты по журналу)',
      deadline: shift(today, 5),
      priority: 'exam',
      completedByUserIds: ['user-2', 'user-4'],
    },
    {
      id: 'hw-4',
      subject: 'Иностранный язык',
      title: 'Презентация «AI in Modern Software Engineering»',
      deadline: shift(today, 10),
      priority: 'normal',
      completedByUserIds: ['user-8', 'user-6'],
    },
  ];

  const announcements = [
    {
      id: 'ann-1',
      authorId: 'user-1',
      title: '📢 Рапортичка и сверка справок',
      content: 'До четверга сдайте медсправки и заявления по уважительным пропускам. Скан можно прислать старосте в личку.',
      timestamp: 'Сегодня, 10:45',
      pinned: true,
      category: 'important',
    },
    {
      id: 'ann-2',
      authorId: 'user-10',
      title: '🎓 Конференция молодых учёных',
      content: '20 ноября — студенческая научно-практическая конференция. Регистрация докладов до конца недели.',
      timestamp: 'Вчера, 16:20',
      pinned: false,
      category: 'dean',
    },
  ];

  const polls = [
    {
      id: 'poll-1',
      authorId: 'user-1',
      question: 'Когда проводим консультацию по теории вероятностей?',
      options: [
        { id: 'opt-1', text: 'Пятница 14:00 (ауд. 504)', votedUserIds: ['user-1', 'user-2', 'user-4', 'user-8'] },
        { id: 'opt-2', text: 'Суббота 11:00 (Zoom)', votedUserIds: ['user-3', 'user-5', 'user-7', 'user-9'] },
        { id: 'opt-3', text: 'Согласен с большинством', votedUserIds: ['user-6'] },
      ],
      isMultiple: false,
      isClosed: false,
    },
    {
      id: 'poll-2',
      authorId: 'user-6',
      question: 'Куда идём группой после закрытия модуля?',
      options: [
        { id: 'opt-2-1', text: 'Боулинг / бильярд', votedUserIds: ['user-5', 'user-7', 'user-9'] },
        { id: 'opt-2-2', text: 'Пиццерия + настолки', votedUserIds: ['user-1', 'user-2', 'user-4', 'user-6', 'user-8'] },
        { id: 'opt-2-3', text: 'Квиз в антикафе', votedUserIds: ['user-3'] },
      ],
      isMultiple: false,
      isClosed: false,
    },
  ];

  const attendance = [
    {
      id: `att-${today}-1`,
      date: today,
      pairNumber: 1,
      subject: 'Корпоративные информационные системы',
      teacher: 'проф. Савицкий В.К.',
      records: {
        'user-1': 'present',
        'user-2': 'present',
        'user-3': 'late',
        'user-4': 'present',
        'user-5': 'absent',
        'user-6': 'present',
        'user-7': 'present',
        'user-8': 'present',
        'user-9': 'excused',
        'user-10': 'present',
      },
      updatedAt: new Date().toISOString(),
    },
  ];

  return {
    groupMeta: {
      code: 'БИ(ЭБ) 1/2',
      faculty: 'Факультет управления и права',
      course: 1,
      university: 'Краснодарский кооперативный институт (филиал) РУК',
      curatorName: 'доц. Кубанская Елена Николаевна',
      region: 'Краснодарский край',
      year: new Date().getFullYear(),
    },
    starostaMandate: {
      isSigned: true,
      signatureText: 'Дунаев Д.С. (1 п/гр) и Сергеева А.В. (2 п/гр)',
      orderNumber: 'Приказ ККИ РУК №84-СТ',
    },
    users,
    schedule,
    homework,
    announcements,
    polls,
    attendance,
    botUsers: {},
    meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 },
  };
}

function shift(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

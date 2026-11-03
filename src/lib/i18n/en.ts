export const en = {
  meta: {
    title: "Haunted Pet To-Do",
    description:
      "A spooky to-do list where finishing tasks keeps a little ghost pet alive.",
  },
  locale: {
    label: "Language",
    english: "English",
    traditionalChinese: "繁體中文",
  },
  brand: {
    kicker: "KIROWEEN 2026",
    title: "Haunted Pet To-Do",
  },
  landing: {
    blurb:
      "Finish a task and a little ghost pet thrives. Leave the list alone and the zombies crawl in.",
  },
  app: {
    listening: "The spirit is listening…",
    evolved: "Your pet evolved.",
    emptyTasks: "No tasks yet. The egg is waiting.",
    error: (message: string) => `Error: ${message}`,
    graveyard: (count: number) => `Graveyard (${count})`,
    graveyardEntry: (stage: string, epitaph: string) => `${stage}: ${epitaph}`,
  },
  sound: {
    mute: "Mute sound",
    unmute: "Unmute sound",
    on: "Sound",
    off: "Muted",
  },
  stage: {
    egg: "egg",
    hatchling: "hatchling",
    adult: "adult",
    adult_night_owl: "adult_night_owl",
    adult_early_bird: "adult_early_bird",
    adult_scholar: "adult_scholar",
    adult_haunter: "adult_haunter",
  },
  status: {
    todo: "todo",
    done: "done",
    overdue: "overdue",
  },
  category: {
    study: "study",
    work: "work",
    chores: "chores",
    health: "health",
    creative: "creative",
    other: "other",
  },
  size: {
    small: "small",
    medium: "medium",
    large: "large",
  },
  form: {
    task: "Task",
    category: "Category",
    size: "Size",
    due: "Due, optional",
    alreadyLate: "Already late",
    add: "Add task",
  },
  task: {
    up: "Up",
    down: "Down",
    done: "Done",
    moveUp: (title: string) => `Up, move ${title}`,
    moveDown: (title: string) => `Down, move ${title}`,
    complete: (title: string) => `Complete ${title}`,
    breakDown: "Ask ghost to break this down 👻",
  },
  demo: {
    label: "Demo clock",
    offset: (hours: number) => `Clock +${hours}h`,
    announcement: (hours: number) => {
      const unit = Math.abs(hours) === 1 ? "hour" : "hours";
      return `Demo clock offset is ${hours} ${unit}`;
    },
    refused: "The clock refused to move.",
    plus1: "+1h",
    plus1Name: "+1h, advance time by 1 hour",
    plus6: "+6h",
    plus6Name: "+6h, advance time by 6 hours",
    plus24: "+24h",
    plus24Name: "+24h, advance time by 24 hours",
    reset: "Reset",
    resetName: "Reset the demo clock",
  },
  tombstone: {
    dialog: "Pet tombstone",
    alt: "Tombstone for a ghost pet",
    newEgg: "New Egg",
    settling: "The stone is settling…",
  },
  sprite: {
    egg: "Ghost pet egg",
    hatching: "Ghost pet egg hatching",
    hatchling: "Ghost pet — hatchling stage",
    stage: (label: string) => `Ghost pet — ${label} stage`,
    hungry: (label: string) => `Ghost pet — ${label} stage, hungry`,
    zombie: "Zombie haunting an overdue task",
  },
  stats: {
    hp: "HP",
    hunger: "Hunger",
    mood: "Mood",
  },
  epitaph: {
    fallback: "Here lies a to-do list. It never stood a chance.",
  },
  speech: {
    hatchling: {
      overdue: "nooo… overdue bad 😢",
      hungry: "hungry… do thing pls",
      celebrate: "yay!! u did it!! ✨",
      ask: "boo… 👻 task?",
    },
    adult: {
      haunting: (title: string) =>
        `The ghost of "${title}" walks these halls and it will not rest 💀`,
      dramatic: "WOOOO it has been HOURS and your task is still undone 😱👻",
      gentle: "Pssst… your task is just sitting there, getting a liiittle cold 🌙",
      hungry: "I haven't eaten since that last task… I'm fading 🌫️",
      mood: "My mood is: haunted mansion on a Monday. Help.",
      evolved: "I evolved because of YOU. Don't make me regret it 👑👻",
      happy: "You're on a roll, spooky friend ✨ I can feel the power!",
    },
  },
  nag: {
    hatchling: {
      gentle: "boo… 👻 one tiny task?",
      dramatic: "nooo… overdue bad. do thing pls 😢",
      haunting: "nooo… finish one task so I can rest 😢",
    },
    adult: {
      gentle: "One tiny task. Just one. I believe in you 👻",
      dramatic: "WOOOO it has been HOURS and your task is still undone. Finish one 😱👻",
      haunting: (name: string) => `The ghost of "${name}" will not rest. Do it, then I can. 💀`,
    },
  },
  push: {
    waiting: "A task is waiting.",
  },
  breakdown: {
    intro: "Oooh a big one 👻 Let me break this haunting task down for you…",
    already: "These steps are already waiting 👻",
    open: (name: string) => `Open ${name} and write the first step`,
    middle: (name: string) => `Do the middle piece of ${name}`,
    check: (name: string) => `Check ${name} and mark it done`,
  },
  ai: {
    language: "Write in English.",
  },
  errors: {
    houseDarkRetry: "The house is dark. Try again.",
    houseDark: "The house is dark.",
    signInFailed: "Sign-in failed. Try again.",
    demoLocked: "Demo mode is locked.",
    rustled: "Something rustled and failed.",
    taskSlipped: "The task slipped through the floorboards.",
    taskWouldNotClose: "That task would not close.",
    listWouldNotShuffle: "The list would not shuffle.",
    eggNotReady: "The egg is not ready.",
    ghostCouldNotBreak: "The ghost could not break that down.",
    taskNeedsName: "A task needs a name",
    taskLooksWrong: "That task does not look right",
    dueNotReal: "That due time is not a real moment",
    demoFull: "Demo is full",
    demoLimit: "This demo keeps a limited number of tasks.",
    forbidden: "Forbidden",
    unauthorized: "Unauthorized",
    serviceBusy: "Service busy",
    storageError: "Storage error",
    taskNotFound: "Task not found",
    taskAlreadyDone: "Task is already done",
    onlyLarge: "Only a large task can be broken down",
    doneCannotBreak: "A done task cannot be broken down",
    claimLost: "That task can no longer be broken down",
    petAlive: "The pet is still with us",
    epitaphRace: "Pet changed while the epitaph was carved",
    rebirthOnlyDead: "Rebirth is only available after the pet has died",
    rebirthRace: "Pet changed while rebirth was saving",
    timeZoneFixed: "Time zone is fixed when the pet is created",
    doneCannotEdit: "Done tasks cannot be edited",
    doneCannotChangeStatus: "Done tasks cannot change status",
    parentNotFound: "Parent task not found",
    invalidRequest: "Invalid request",
    tooManyPush: "Too many push subscriptions",
    pushEndpoint: "Push endpoint is not allowed",
    pushKeys: "Push keys are not valid",
    supabaseUrl: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See README.",
    supabaseService: "Set SUPABASE_SERVICE_ROLE_KEY. See README.",
    unexpectedPayload: "The save came back in a shape we did not expect.",
    clockOffset: "The clock offset has to be a whole number, zero or more.",
  },
} as const;

type DictionaryShape<T> = T extends (...args: infer A) => unknown
  ? (...args: A) => string
  : T extends object
    ? { readonly [K in keyof T]: DictionaryShape<T[K]> }
    : string;

export type Dictionary = DictionaryShape<typeof en>;

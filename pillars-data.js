/* The five pillars for next year, in Shivam's words, and the small daily habits under each one.
   Plain data only. The habits are starting points: tell Claude what to change and it changes here.
   Ticks are saved by tasks-all.js in the same private day document as the study-day ticks (marked k:"pl"). Nothing else is stored. */
window.PIL_DATA = {
  /* The yearly target from the Real Estate Business project: 20 closed deals at an average of $15,000. */
  year: { deals: 20, avg: 15000 },
  pillars: [
    { id: "lic", n: 1, name: "Commercial licence", why: "Add the commercial real estate licence.",
      week: ["Applied for the course. Nothing to study until it is approved.", "When it is approved, tell me and I start your 8-day study plan from that day."],
      habitsWait: ["Check your email for the course approval"], habits: ["Study block from your study plan"] },
    { id: "pro", n: 2, name: "Prospecting set-up", why: "A proper set-up for finding and keeping conversations going.",
      week: ["Mon Nov 23: builder run, Airdrie, Chestermere, Cochrane (it is in your Today list).", "Work the top 5 people on the Reach out card each day.", "Send me your numbers (below) so I can set the weekly counts."],
      habits: ["Log your top 5 people on the Reach out card", "Start one new conversation", "One builder touch"] },
    { id: "com", n: 3, name: "Communication", why: "Be firmer. Use the right words, the right amount, and know how to end the conversation.",
      week: ["Practice: answer first, one reason, stop.", "Keep a text under 40 words and an email under 90.", "Score each day with the Stop test below."],
      habits: ["Write the one sentence you want them to walk away with, before each key call", "Answer, one reason, stop, on every call", "Word check one message you sent today"] },
    { id: "app", n: 4, name: "Improve this app", why: "Keep improving the whole app we built.",
      week: ["Use it for the whole day, then tell Claude what got in the way.", "Latest: one Today list, then pillars."],
      habits: ["Note one thing the app got wrong or missed today"] },
    { id: "hlt", n: 5, name: "Body and mind", why: "Work on your physical health and your mental health.",
      week: ["The same three habits every day. Small on purpose.", "Tell me what you already do (gym, sleep, walks) and I turn it into your habits here."],
      habits: ["Move for 25 minutes", "Phone out of the bedroom tonight", "10 minutes of quiet, no screen"] }
  ],
  /* Communication practice */
  rules: [
    ["Answer first", "Your first sentence is the answer. The reason comes second."],
    ["One reason, then stop", "Give one reason, then stop talking. Let the quiet do the work."],
    ["End on a next step", "The call ends when the next step has an owner and a date. If they start repeating themselves, close."]
  ],
  closers: [
    "So the next step is mine. I'll send it tonight.",
    "Let me leave it there. I'll follow up Thursday.",
    "We're set. Thanks for your time.",
    "I'll let you go. Talk soon.",
    "Decision made, so I'll take it from here and message you by 5."
  ],
  /* starting budgets, in words. 75 words is about 30 seconds spoken. */
  budgets: [["Text", 40], ["Email", 90], ["Voice note", 75]]
};

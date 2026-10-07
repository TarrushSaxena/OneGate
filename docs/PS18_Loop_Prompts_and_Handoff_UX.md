# PS18 Loop Prompts and Handoff UX Spec

## Part 1. What the user sees (UX Contract)

### Design rules
1. Always label who is speaking: "AI assistant" or "Name, Level 2, IT Support". A person is never mistaken for the bot.
2. Never leave the user in silence. Every state shows what happens next and roughly when.
3. Show time as a range plus a clock time ("About 15 to 25 min, by 2:40 PM"). Never a single precise minute count.
4. Priority is a word plus a plain reason. Color is never the only signal.
5. One thread from start to finish. A person's reply appears in the same chat.
6. The user can keep using the AI for other questions while a ticket is open.
7. Sentence case, contractions, no "please", no "successfully", no exclamation marks in system copy.

### The 13 UX States
1. **Answering**: Cited answer with a small source chip (for example "IT Policy §3.1"), thumbs up or down, "Talk to a person" link always visible.
2. **Clarifying**: One short question with 2 or 3 tap replies, never a second question in a row.
3. **Handoff, queued**: Handoff card: department, priority with reason, assigned first name and level, reply range and clock time, progress steps, "Add details" and "Change priority" buttons.
4. **Agent joined**: "Ravi joined the chat", sender label with level, status strip with live reply countdown, typing indicator.
5. **Waiting on you**: Banner: "Ravi needs one more detail from you", reply box focused, ETA paused with an explanation.
6. **Escalated**: Banner explaining why in plain words, new level, new reply target, note that the earlier notes went with the ticket.
7. **Resolved**: Two line summary of what was done, one tap rating, "It's not fixed" button that reopens in the same thread.
8. **Reopened**: "Reopened. This goes to the front of the line." Priority bumps one step, same agent if available, otherwise one level up.
9. **Off hours**: "IT Support is offline until 9:00 AM. Your ticket is first in line. Here's a self serve fix to try now." plus the cited article.
10. **No one free**: "Everyone at this level is busy. You're 3rd in line, about 20 to 30 min." Queue position updates live.
11. **Sensitive action**: Identity check card before any password reset, refund, or payroll change, then the ticket is created.
12. **Content filter**: Offensive language: a calm one line reminder, the message is still handled. Personal data: "We hid your card number for safety" with the masked text shown.
13. **Outage banner**: When many people report the same issue: "IT is working on a known VPN issue. Updates here." No new ticket per person, but they can subscribe.

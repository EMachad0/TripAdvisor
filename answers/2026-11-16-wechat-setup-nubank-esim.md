---
question: "How do I set up WeChat on my Galaxy Fold when I have a Nubank eSIM, Chinese pages time out and I can't send or receive SMS with China?"
asked: 2026-11-16
about: china
tldr: "The Nubank eSIM is the blocker, not the phone: the travel eSIM is data only (no number), and the NuCel line is reported to have no service outside Brazil. Sign up in Brazil, on Wi-Fi, with a number that does get foreign SMS (a prepaid chip from another carrier works), then have an existing WeChat user scan the sign-up QR code. Finish before flying (as of Nov 2026)."
sources:
  - title: "WeChat Help Center: not receiving the SMS verification code"
    url: https://cs.help.wechat.com/hc/en-us/articles/11917211993487-What-should-I-do-if-I-don-t-receive-the-SMS-verification-code-when-logging-in
  - title: "Tecnoblog: how NuCel works (no international roaming)"
    url: https://tecnoblog.net/responde/como-funciona-a-nucel-o-que-voce-precisa-saber-antes-de-contratar/
  - title: "Nubank: travel eSIM (eSIM internacional)"
    url: https://nubank.com.br/ultravioleta/conta-global/esim-internacional
  - title: "Sinorbis: how to sign up for a WeChat personal account (helper rules)"
    url: https://www.sinorbis.com/how-to-sign-up-for-a-wechat-personal-account
  - title: "RealChinaTrip: WeChat setup guide for tourists (2026)"
    url: https://realchinatrip.com/blogs/tips/wechat-setup-guide-tourists
---
**Why it fails.** WeChat ties the account to a phone number and checks it by SMS: usually a code sent to you, sometimes a text you must send to a Chinese number. Nubank has two eSIMs and neither is good at this:

- **Travel eSIM (Conta Global / Ultravioleta):** data only. It has no phone number, so no SMS in either direction, ever.
- **NuCel (the Brazilian line):** Tecnoblog reports it has no international roaming, so calls, SMS and data stop outside Brazil. Whether it blocks SMS to and from foreign numbers while in Brazil is not confirmed; ask Nubank support in the app.

**Steps, in Brazil, before the flight.**

1. Use home Wi-Fi, not the eSIM. Turn off any VPN, and set Settings › Connections › More connection settings › Private DNS to Automatic (ad-blocking DNS often breaks Chinese domains). This is the likely fix for the pages that time out, but it is a guess until tested.
2. Install WeChat from the Play Store (publisher: WeChat International). Give it the SMS and phone permissions when asked.
3. Sign up with a +55 number that receives foreign SMS. If the Nubank line does not, put a prepaid chip from Claro, Vivo or TIM in the physical SIM tray; the Fold takes one nano-SIM next to the eSIM.
4. No code after a minute? Look in Messages › Settings › Block numbers and spam, then wait for the "voice call" option: WeChat's help page says the code can come by automated call.
5. If WeChat asks you to *send* a text to a Chinese number and the line refuses, go back and start again on another network or the other SIM. The flow is not the same every time.
6. Security check: WeChat shows a QR code that an existing user must scan from their own app. Guides disagree on the rules for that helper (account at least 1 month old for foreign accounts or 6 months for Chinese ones, and not having helped anyone else recently). Anyone you know with WeChat works.
7. Straight after: Me › Settings › Account Security. Set a password and link an email, so later logins do not need an SMS.
8. WeChat Pay: Me › Services › Wallet › Cards. Add the card and do the passport check. It can ask for an SMS code again, one more reason to finish at home.

**If it still fails.** Do the QR step in China: hotel front desk staff do this for guests all the time. Alipay covers payments in the meantime, so WeChat is not a blocker for arrival day.

**What to remember for the trip.** With a Nubank line as the only number, no SMS code reaches the phone anywhere abroad. Do every SMS-dependent setup before leaving: WeChat, Alipay, bank and card 2FA. The data eSIM for the trip does not change this. Keep the prepaid chip topped up if it becomes the WeChat number, or the line expires.

Avoid paid "virtual number" sites for the code: the number is shared or recycled, so someone else can take the account later.

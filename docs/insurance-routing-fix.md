# Insurance assistant routing fix

The middleware previously classified every question containing `scad...` as a payment/deadline question and rewrote it to `/api/assistant-safe`. That route only evaluates payment deadlines, so generic insurance-expiry questions could incorrectly return TARI or other settled payments.

The middleware now handles insurance-expiry intent before the payment guard:

- generic insurance question: asks whether the user means Audi, camper or home;
- specific insurance question: rewrites to `/api/assistant-insurance`;
- the dedicated route enriches the request so the assistant reads the relevant policy/certificate and distinguishes coverage expiry from payment or receipt dates.

# Insurance routing test cases

Expected behavior:

1. `Quando scade l'assicurazione?`
   - Reply asks: Audi, camper or home.
   - No archive search and no TARI result.

2. `Quando scade l'assicurazione dell'Audi?`
   - Route: `/api/assistant-insurance`.
   - Answer refers only to the Audi policy.

3. `Quando scade l'assicurazione del camper?`
   - Route: `/api/assistant-insurance`.
   - Answer refers only to the camper policy.

4. `Quando scade l'assicurazione della casa?`
   - Route: `/api/assistant-insurance`.
   - Answer refers only to the home policy.

5. `Quanto devo pagare questa settimana?`
   - Existing payment-safe routing remains unchanged.

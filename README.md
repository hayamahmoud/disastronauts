# Disastronauts

Grow your base. Survive Mars. Don't be a disaster.

A browser game for kids (7–12) built for NASA Space Apps 2026 ("Build a Junior Astronaut Mission Trainer").

## Run it

```bash
npm install
npm run dev     # open the URL it prints
npm test        # run the simulation tests
```

## Placeholders not yet backed by real NASA data

- Map terrain: a crater-shaped placeholder until the real Mars Trek (Jezero Crater) elevation is processed.
- Background radiation damage (`BALANCE.crew.radiationDamagePerSol`): to be replaced with a RadLab baseline dose rate.
- Solar flare classes (C/M/X): picked at random for now; M5 will replay real flares from NASA DONKI.

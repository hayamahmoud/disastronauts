// One "What you learned" fact is shown on the podium after each round.
// Only real, sourced facts. M5 moves these into src/data/facts.json together
// with the OSDR crew-health facts.

export interface RoundFact {
  text: string;
  source: string; // short name shown under the fact
  url: string;
}

export const ROUND_FACTS: RoundFact[] = [
  {
    // SOURCE: NASA NSSDCA Mars Fact Sheet, "Length of day 24.6597 hrs"
    text: 'A day on Mars is called a sol. It lasts 24 hours and 39 minutes.',
    source: 'NASA Mars Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
  },
  {
    // SOURCE: NASA NSSDCA Mars Fact Sheet, solar irradiance Mars 586.2 vs Earth 1361.0 W/m² (43%)
    text: 'Mars gets less than half the sunlight Earth gets, so solar panels make less Power there.',
    source: 'NASA Mars Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
  },
  {
    // SOURCE: NASA NSSDCA Mars Fact Sheet, distance from Earth 54.6–401.4 million km,
    // divided by the speed of light (299,792.458 km/s) = 3.0 to 22.3 minutes.
    text: 'A radio message between Earth and Mars takes 3 to 22 minutes, so astronauts must plan ahead.',
    source: 'NASA Mars Fact Sheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
  },
  {
    // SOURCE: NASA Science, Phobos page: about 27 x 22 x 18 km (same source as the Phobos model in gameView.ts)
    text: 'Mars has a lumpy little moon called Phobos. It is only about 27 km long.',
    source: 'NASA Science: Phobos',
    url: 'https://science.nasa.gov/mars/moons/phobos/',
  },
];

// The same seed always shows the same fact, so a replayed map is consistent.
export function factForRound(seed: number): RoundFact {
  return ROUND_FACTS[seed % ROUND_FACTS.length];
}

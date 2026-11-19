export const QUOTES: { text: string; author: string }[] = [
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
  { text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { text: "Education is the most powerful weapon which you can use to change the world.", author: "Nelson Mandela" },
  { text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.", author: "Dr. Seuss" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
  { text: "The only person who is educated is the one who has learned how to learn and change.", author: "Carl Rogers" },
  { text: "Education is not the filling of a pail, but the lighting of a fire.", author: "William Butler Yeats" },
];

export function pickQuote(seed?: number) {
  const i = seed !== undefined ? seed % QUOTES.length : Math.floor(Math.random() * QUOTES.length);
  return QUOTES[i];
}

/** Widok bez budynków (klawisz U): domy, zakłady, drzewa i dachy peronów znikają, tory i drogi zostają. */
let hidden = false;

export function buildingsHidden(): boolean {
  return hidden;
}

export function setBuildingsHidden(on: boolean): void {
  hidden = on;
}

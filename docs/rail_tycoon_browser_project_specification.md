# Projekt: "Iron Hub" (Przeglądarkowa gra kolejowa w stylu retro)

## 1. Wizja i Założenia Projektowe
„Iron Hub” to nowoczesna, minimalistyczna gra przeglądarkowa inspirowana klasycznym *OpenTTD*, ale oczyszczona z męczącego mikrozarządzania. Gracz wciela się w magnata kolejowego, którego zadaniem jest budowa sieci torów i zarządzanie pociągami.

### Kluczowe wyróżniki (USP):
* **Tylko pociągi dla gracza:** Zero budowania dróg, linii autobusowych czy lotnisk. Cały ruch pomocniczy (ciężarówki, autobusy, auta osobowe) generowany jest autonomicznie przez inteligentny system gry (AI).
* **Autonomiczne miasta i przemysł:** Postawienie stacji uruchamia rozwój miasta i fabryk. Miasta same dowożą pasażerów i towary do Twoich stacji za pomocą lokalnego transportu AI.
* **Dwa tryby sterowania ruchem:**
  * **Tryb Amator:** Automatyczne zarządzanie sygnalizacją (AI stawia bezpieczne odstępy i semafory, pociągi się nie zderzają).
  * **Tryb Ekspert:** Pełen zestaw semaforów w stylu *OpenTTD* (blokowe, ścieżkowe, jednokierunkowe) dla weteranów optymalizacji.
* **Pojemnościowy model fabryk:** Fabryki nie blokują się z braku surowców – im więcej dowieziesz (węgla, rudy, pasażerów/siły roboczej), tym wyższa jest ich produkcja i poziom rozbudowy.

---

## 2. Stos Technologiczny (Tech Stack)

* **Frontend (Przeglądarka):**
  * **TypeScript:** Język programowania (bezpieczeństwo typów przy złożonej logice siatki i pociągów).
  * **Phaser 3:** Silnik 2D/WebGL do renderowania mapy kafelkowej (Tilemap) i płynnej animacji pociągów (60 FPS).
  * **HTML / CSS + Tailwind CSS:** Do budowy czytelnego interfejsu użytkownika (UI) w stylu retro-nowoczesnym (okienka rozkładów jazdy, menu budżetowe).
* **Grafika:**
  * Zasoby z pakietu **OpenGFX** (licencja GPLv2) lub dedykowany, minimalistyczny pixel art izometryczny.
* **Backend (Opcjonalnie / Faza 2):**
  * **Node.js + Express** (do obsługi zapisu w chmurze i rankingów graczy).
  * **PostgreSQL / IndexedDB** (lokalny zapis gry u gracza na start, chmura w późniejszym etapie).

---

## 3. Pętle Rozgrywki (Core Loops)

1. **Budowa:** Gracz wytycza tory $\rightarrow$ stawia stację przy osiedlu i fabryce.
2. **Reakcja Świata:** AI zauważa stację $\rightarrow$ autonomiczne busy zwożą mieszkańców na peron $\rightarrow$ fabryka zgłasza zapotrzebowanie na pracowników i surowce.
3. **Transport:** Gracz puszcza pociąg towarowy i pasażerowski $\rightarrow$ pociąg przewozi towary i siłę roboczą.
4. **Rozwój:** Fabryka zwiększa poziom i produkcję $\rightarrow$ miasto rośnie wzdłuż wyznaczonego korytarza transportowego $\rightarrow$ gracz zarządza zyskiem i modernizuje sieć (dodatkowe torowiska, szybsze lokomotywy).

---

## 4. Co dalej? – Roadmapa rozwoju projektu (Kroki implementacji)

Aby nie przytłoczyć się ilością pracy, projekt podzielimy na mniejsze, mierzalne etapy (MVP – Minimum Viable Product):

### Krok 1: Prototyp siatki i układania torów (2-3 tygodnie)
* Skonfigurowanie projektu w TypeScript + Phaser 3.
* Stworzenie prostej, kwadratowej lub izometrycznej siatki mapy (Grid).
* Umożliwienie graczowi „klikania i stawiania” prostych odcinków torów oraz stacji.

### Krok 2: Prosty ruch pociągu (2 tygodnie)
* Dodanie pierwszego wektora pociągu, który potrafi poruszać się po wyznaczonej ścieżce z punktu A do punktu B.
* Podstawowy interfejs zakupu lokomotywy.

### Krok 3: Gospodarka i Miasta AI (3 tygodnie)
* Zaprogramowanie prostych stanów miast (liczba mieszkańców, zapotrzebowanie).
* Dodanie logiki fabryk (przetwarzanie dowiezionych surowców na zysk i punkty rozwoju).
* Symulacja ruchu AI wokół stacji (proste animacje autek dojeżdżających do peronów).

### Krok 4: Sygnalizacja i Tryb Ekspert (3 tygodnie)
* Wdrożenie algorytmów wykrywania kolizji na skrzyżowaniach i zwrotnicach.
* Dodanie automatycznego systemu semaforów (Tryb Amator) oraz ręcznego rozmieszczania sygnałów (Tryb Ekspert).

### Krok 5: Szata graficzna Retro UI i Testy (2 tygodnie)
* Podpięcie sprite'ów OpenGFX.
* Stworzenie ładnego menu, dźwięków (pisk kół, gwizdek parowozu) i publikacja na platformie *itch.io*.

---
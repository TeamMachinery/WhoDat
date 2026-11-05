# Ljudi

Osobni imenik ljudi koje upoznaješ. Za svaku osobu: slika, ime i prezime, datum rođenja, gdje živi, i sekcije sa stavkama (Voli, Ne voli, Upoznali smo se + sekcije koje sama dodaš).

Progresivna web aplikacija (PWA) — bez servera, bez prijave. Svi podaci ostaju **samo na tvom iPhoneu** (IndexedDB u Safariju).

## Objava na GitHub Pages

1. Na github.com napravi novi repozitorij, npr. `ljudi` (može biti **Public**; GitHub Pages za privatne repozitorije traži plaćeni plan).
   Tvoji podaci o ljudima **nisu** u repozitoriju — u njemu je samo kod aplikacije.
2. Uploadaj ove datoteke u repozitorij (*Add file → Upload files*):
   - `index.html`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`
   - mapu `icons/` (sve tri slike)
   
   Mapu `.claude/` ne treba uploadati — ona služi samo za lokalno testiranje.
3. U repozitoriju: *Settings → Pages → Build and deployment → Source: Deploy from a branch*, branch `main`, mapa `/ (root)` → *Save*.
4. Za minutu-dvije aplikacija je na `https://TVOJE-KORISNIČKO-IME.github.io/ljudi/`.

## Instalacija na iPhone

1. Otvori gornju adresu u **Safariju**.
2. Dodirni *Podijeli* (kvadrat sa strelicom) → **Dodaj na početni zaslon** → *Dodaj*.
3. Otvaraj aplikaciju uvijek preko ikone na početnom zaslonu — tako radi i bez interneta i podaci su sigurniji.

> ⚠️ Podaci u aplikaciji na početnom zaslonu i u Safariju su odvojeni. Unosi podatke samo u aplikaciju s početnog zaslona.

## Sigurnosna kopija

*Postavke (ikona gore lijevo) → Izvezi sve podatke* — spremi datoteku u Datoteke / iCloud Drive.
Ako obrišeš aplikaciju s početnog zaslona ili promijeniš mobitel, podatke vraćaš s *Uvezi iz kopije*. Preporuka: izvezi kopiju svakih par tjedana.

## Kako se koristi

- **Lista** je poredana po imenu. Pretraga traži po imenu i prezimenu te po tekstu u sekciji *Upoznali smo se* (radi i bez kvačica: „tresnjevka" nađe „Trešnjevka").
- **Profil**: dodirni kružić za veliku sliku, *Uredi* za osnovne podatke i sliku.
- **Stavke**: `+` pored naslova sekcije dodaje stavke — svaki red teksta postaje zasebna stavka. Dodirni stavku da je izmijeniš ili obrišeš.
- **Sekcije**: *+ Nova sekcija* na dnu profila ili u Postavkama. Nova sekcija pojavljuje se na svim profilima; stavke u njoj pripadaju samo osobi kojoj ih upišeš. U Postavkama sekcije možeš preimenovati, presložiti i obrisati.

## Ažuriranje aplikacije

Kad promijeniš kod i ponovno ga uploadaš na GitHub, iPhone će novu verziju preuzeti sljedeći put kad aplikaciju otvoriš s internetom (ponekad je treba zatvoriti i otvoriti dvaput).

## Lokalno testiranje (na Macu)

```bash
node .claude/serve.js
```
Zatim otvori http://localhost:8080

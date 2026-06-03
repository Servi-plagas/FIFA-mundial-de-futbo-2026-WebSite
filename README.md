# ⚽ Polla Mundialista 2026 — Serviplagas

Sitio web para mostrar los **pronósticos** de la polla del Mundial 2026 y compararlos
con los **resultados reales**, calculando los puntos de cada participante según el
*Sistema de Puntuación*.

Está hecho con **HTML, CSS y JavaScript puros**: no hay que instalar nada ni compilar.
Se publica gratis en **GitHub Pages**.

> **En una frase:** subes los pronósticos una vez, y cada día del Mundial editas un
> archivo con los resultados reales. El sitio recalcula la tabla de posiciones solo.

---

## 📁 Qué hay en el proyecto

| Archivo / carpeta | Para qué sirve | ¿Lo editas tú? |
|---|---|---|
| `index.html` | La página principal del sitio | No |
| `convertir.html` | Herramienta para convertir el Excel en datos del sitio | No (solo la usas) |
| `assets/` | Estilos y código del sitio | No |
| `data/predictions.json` | **Los pronósticos** de todos los participantes | Sí (se regenera con `convertir.html`) |
| `data/results.json` | **Los resultados reales** del Mundial | ✅ **Sí, a diario** |
| `data/fixtures.json` | La estructura del torneo (grupos y llave). Es fija. | No |
| `data/teams.json` | Lista exacta de los 48 equipos (para copiar nombres) | No |

---

## 🚀 Publicar el sitio en GitHub Pages (una sola vez)

1. Entra al repositorio en GitHub: **Servi-plagas/FIFA-mundial-de-futbo-2026-WebSite**.
2. Arriba, haz clic en **Settings** (Configuración).
3. En el menú de la izquierda, haz clic en **Pages**.
4. En **Source** (Origen), elige **Deploy from a branch** (Desplegar desde una rama).
5. En **Branch**, selecciona **`main`** y la carpeta **`/ (root)`**. Haz clic en **Save**.
6. Espera 1–2 minutos. GitHub te mostrará la dirección del sitio, algo como:
   `https://servi-plagas.github.io/FIFA-mundial-de-futbo-2026-WebSite/`
7. ¡Listo! Comparte ese enlace con los participantes.

> Cada vez que subas un cambio (un *commit*) al repositorio, el sitio se actualiza solo
> en 1–2 minutos.

---

## 🔄 Actualizar los **pronósticos** (cuando lleguen más participantes)

Cuando descargues una nueva versión del Excel desde KoboToolbox (con más gente):

1. Abre el sitio publicado y agrégale `/convertir.html` al final de la dirección.
   Ejemplo: `https://servi-plagas.github.io/FIFA-mundial-de-futbo-2026-WebSite/convertir.html`
   *(O abre el archivo `convertir.html` localmente; ver “Probar en tu computador”.)*
2. **Arrastra el Excel** (`.xlsx`) al recuadro. Se descargará un archivo llamado
   `predictions.json`.
3. En GitHub, entra a la carpeta **`data/`**, abre `predictions.json`, haz clic en el
   ícono del lápiz ✏️ (o usa “Add file → Upload files”) y **reemplázalo** por el que
   acabas de descargar.
4. Guarda los cambios (**Commit changes**). El sitio se actualiza solo.

---

## 📅 Actualizar los **resultados reales** (a diario, durante el Mundial)

Esto es lo único que harás todos los días. Editas el archivo **`data/results.json`**.

### Reglas básicas

- Solo cambia los valores que están en `null` por números o nombres de equipo.
- `hg` = goles del equipo **local** (el de la izquierda, *home*).
- `ag` = goles del equipo **visitante** (el de la derecha, *away*).
- `ph` / `pa` = goles en la **tanda de penales** (solo si el partido fue a penales).
- Lo que aún **no se ha jugado**, déjalo en `null`. El sitio lo muestra como
  “Aún no jugado” y no resta puntos.
- En `"actualizado"` pon la fecha y hora de la última actualización, por ejemplo
  `"2026-06-20T22:30:00"`. Aparece arriba a la derecha en el sitio.

### Ejemplo — un partido de la fase de grupos

Antes (sin jugar):
```json
{ "home": "México 🇲🇽", "away": "Sudáfrica 🇿🇦", "hg": null, "ag": null }
```
Después de que México le ganó 3–1 a Sudáfrica:
```json
{ "home": "México 🇲🇽", "away": "Sudáfrica 🇿🇦", "hg": 3, "ag": 1 }
```

### Posiciones finales de cada grupo (`standings`)

Cuando termine un grupo, escribe **los 4 equipos completos en su orden final real**
(1.º, 2.º, 3.º, 4.º). Esto sirve para los puntos de **clasificación**.

Antes (como está ahora):
```json
"standings": [null, null, null, null]
```
Después (como lo debes llenar):
```json
"standings": ["México 🇲🇽", "Sudáfrica 🇿🇦", "República de Corea 🇰🇷", "República Checa 🇨🇿"]
```

> ⚠️ **Llena las 4 posiciones, no solo las dos primeras.** El bono de **+5 por acertar
> el puesto exacto** del 3.º depende de que el equipo esté escrito en la **3.ª posición**
> de esta lista. Si dejas el 3.º y el 4.º en `null`, los participantes que clasificaron
> al tercero **sí** reciben los 10 puntos por clasificar (vía `thirdsQualified`), pero
> **pierden** los +5 del puesto exacto.

### Los 8 mejores terceros (`thirdsQualified`)

Cuando la FIFA confirme los 8 mejores terceros que avanzan, escríbelos aquí.

Antes (como está ahora):
```json
"thirdsQualified": [null, null, null, null, null, null, null, null]
```
Después (como lo debes llenar — los 8 equipos):
```json
"thirdsQualified": ["Japón 🇯🇵", "Croacia 🇭🇷", "Portugal 🇵🇹", "..."]
```

> ℹ️ **Aquí el orden NO importa.** Esta lista solo dice *cuáles* 8 terceros clasificaron;
> da igual en qué orden los escribas. (El bono de +5 por el puesto del 3.º se calcula con
> la posición en `standings`, no con esta lista.)

### ⚠️ Atención: aquí cambia la forma de llenar los datos

La **fase de grupos ya está fija**: los 72 partidos y sus equipos vienen escritos en el
archivo, y tú solo agregas los goles (`hg`/`ag`). **No tienes que escribir nombres de
equipos en los grupos.**

Pero **cuando empieza la eliminación (la llave), la cosa cambia**: en cada partido de la
llave tú **sí tienes que escribir los equipos reales** que se enfrentan, porque la llave
real casi nunca coincide con la que pronosticó cada participante. Si te saltas este paso,
**el sistema no puede saber quién avanzó** y muchos participantes se quedarán en 0 en esa
ronda aunque hayan acertado. Lee con calma las tres reglas de abajo.

### Partidos de eliminación (`knockout`)

Ejemplo del Partido 89 (un Octavos que se fue a penales).

Antes (como está ahora):
```json
"89": { "round": "OCT", "home": null, "away": null,
        "hg": null, "ag": null, "ph": null, "pa": null }
```
Después (como lo debes llenar — equipos reales + marcador + penales):
```json
"89": { "round": "OCT", "home": "Brasil 🇧🇷", "away": "Francia 🇫🇷",
        "hg": 2, "ag": 2, "ph": 4, "pa": 3 }
```

**Las 3 reglas de oro de la llave** (si fallas una, se pierden puntos en silencio):

1. **Escribe los equipos reales en `home` y `away`.** Vienen en `null`; debes ponerlos.
   El sistema reparte los puntos de **“equipos que avanzan”** (15/20/35/50) comparando el
   ganador real con lo que pronosticó cada quien. Si dejas `home`/`away` en `null`,
   **nadie recibe esos puntos**, aunque hayas puesto bien el marcador. `home` es el lado
   local (el de la izquierda de la llave) y `away` el visitante.

2. **El sistema deduce quién ganó a partir del marcador**, no hay una casilla de
   “ganador”. Por eso, **si el partido se va a penales, es OBLIGATORIO llenar `ph`/`pa`.**
   - Si se define en los 90/120 minutos: pon `hg`/`ag` y deja `ph` y `pa` en `null`.
   - Si va a penales: pon el marcador del tiempo regular en `hg`/`ag` (debe quedar
     **empatado**, p. ej. `2`–`2`) y los goles de la tanda en `ph`/`pa`.
   - ⚠️ Si dejas un partido empatado **sin** `ph`/`pa`, el sistema cree que el partido
     no se ha definido: **nadie gana puntos por avanzar ni por acertar el lado**, hasta
     que pongas los penales.

3. **Sí, también se llena el Partido 103 (Tercer puesto) y el 104 (Final).** Cuentan
   igual que los demás para los puntos del partido (lado, total de goles, penales), y el
   104 además define al Campeón y Subcampeón del podio (ver abajo).

### El podio

Cuando termine el Mundial:

Antes (como está ahora):
```json
"podio": { "campeon": null, "subcampeon": null,
           "tercero": null, "cuarto": null }
```
Después (como lo debes llenar):
```json
"podio": { "campeon": "Argentina 🇦🇷", "subcampeon": "España 🇪🇸",
           "tercero": "Francia 🇫🇷", "cuarto": "Brasil 🇧🇷" }
```

> ⚠️ **Muy importante:** los nombres de los equipos deben escribirse **exactamente**
> como aparecen en `data/teams.json` (incluida la banderita). La forma más segura es
> **copiar y pegar** el nombre desde ese archivo. Si un nombre no coincide, ese equipo
> no sumará puntos.

### ¿Cómo subir el cambio?

En GitHub: entra a `data/results.json`, haz clic en el lápiz ✏️, edita los valores,
y abajo haz clic en **Commit changes**. En 1–2 minutos el sitio queda actualizado.

---

## 🧮 Cómo se calculan los puntos

El cálculo está programado en `assets/js/scoring.js` siguiendo el documento
*“Sistema de Puntuación – Polla Mundialista 2026”*:

- **Fase de grupos** (cada uno de los 72 partidos): ganador/empate **6**,
  total de goles **4**, marcador exacto **10**.
- **Clasificación a la Ronda de 32**: **10** por equipo que clasifica, **+5** si
  acertaste su puesto (1.º, 2.º o 3.º del grupo).
- **Equipos que avanzan**: Octavos **15**, Cuartos **20**, Semifinal **35**, Final **50**
  (por cada equipo).
- **Cada partido de la llave** (por el *lado* de la llave, no por el equipo):
  ganador **3**, total de goles **2**, total de goles en penales **2**.
- **Podio**: Campeón **150**, Subcampeón **100**, Tercer lugar **75**.

Durante el torneo, los puntajes son **parciales**: solo se cuentan los partidos que ya
tienen resultado real cargado.

---

## 💻 Probar en tu computador (opcional)

Por seguridad, los navegadores no dejan que la página lea los archivos de datos si la
abres con doble clic. Para probar localmente, abre una terminal en la carpeta del
proyecto y ejecuta:

```bash
python3 -m http.server 8000
```

Luego abre en el navegador: `http://localhost:8000/`
(Para la herramienta de conversión: `http://localhost:8000/convertir.html`.)

Publicado en GitHub Pages esto no hace falta: ahí todo funciona directamente.

---

## ❓ Preguntas frecuentes

**El sitio dice “No se pudieron cargar los datos”.**
Estás abriendo el `index.html` con doble clic. Usa el servidor local (arriba) o entra
por la dirección de GitHub Pages.

**Cambié un resultado pero el sitio no se actualiza.**
Espera 1–2 minutos tras el *commit* y recarga con `Ctrl+F5` (o `Cmd+Shift+R`).

**Un participante aparece con 0 puntos aunque acertó.**
Revisa que los nombres de los equipos en `results.json` estén escritos **idénticos** a
los de `data/teams.json` (copiar/pegar es lo más seguro).

**Nadie recibe puntos por “equipos que avanzan” en una ronda de la llave.**
Casi siempre es porque los `home`/`away` de esos partidos siguen en `null`, o porque un
partido empatado no tiene `ph`/`pa`. Revisa las **3 reglas de oro de la llave** de arriba.

**Un partido de la llave terminó empatado y nadie gana puntos.**
Falta llenar los penales (`ph`/`pa`). Sin ellos, el sistema cree que el partido aún no
se define.

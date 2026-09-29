"use strict";


/* =========================================================
   BUSREVIEW
   APP.JS

   LOGIN LOCAL
   - Sem Google
   - Sem GitHub
   - Sem criação de conta
   - Nome de usuário
   - Foto de perfil
========================================================= */


/* =========================================================
   ATALHOS
========================================================= */

const $ = id =>
  document.getElementById(id);


const arr = value =>
  Array.isArray(value)
    ? value
    : [];


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const CONFIG = Object.freeze({
  raioMapaKm: 1.5,

  zoomUsuario: 16.5,

  minZoomSP: 11,
  maxZoomSP: 19,

  /*
   * Abaixo desse zoom os pontos
   * deixam de ser renderizados.
   *
   * Isso reduz a travada do mapa.
   */
  zoomMinimoMostrarPontos: 15,

  debounceBuscaMs: 260,

  cacheBuscaMs: 90_000,

  cacheLocalMs:
    10 *
    60_000,

  cacheLinhasMs:
    30_000,

  atualizarPontoMs:
    20_000,

  limitePrevisaoMin: 40,

  limiteVerdeMin: 19,

  amareloMs:
    60_000,

  raioDestinoM: 1200,

  distanciaChegadaPontoM: 35,

  recalcularRotaDepoisM: 50,

  recalcularRotaDepoisMs:
    18_000,

  deslocamentoAtualizarPontosM:
    350,

  maxFotos: 4,

  maxFotoBytes:
    8 *
    1024 *
    1024,

  flashMs:
    5 *
    60 *
    60_000,

  storage: Object.freeze({
    perfil:
      "busreview_perfil_local",

    avaliacoes:
      "busreview_avaliacoes",

    flash:
      "busreview_flash",

    lugares:
      "busreview_lugares"
  })
});


/* =========================================================
   ESTADO
========================================================= */

const state = {
  lat: null,
  lon: null,

  primeiraLocalizacao:
    true,

  userMarker:
    null,

  pontos:
    [],

  layerPontos:
    null,

  markers:
    new Map(),

  pontoSelecionadoId:
    null,

  ponto:
    null,

  pontoId:
    null,

  linhaPesquisaSelecionada:
    null,

  ultimaLinhaAutoDestacada:
    null,

  timerPonto:
    null,

  renderTimer:
    null,

  carregandoPontos:
    false,

  ultimaBuscaPontosLat:
    null,

  ultimaBuscaPontosLon:
    null,

  modoNavegacao:
    false,

  zoomEmAndamento:
    false,

  buscaSeq:
    0,

  buscaTimer:
    null,

  buscaAbort:
    null,

  nota:
    0,

  linhaAvaliacao:
    null,

  pontoAvaliacao:
    null,

  fotosAvaliacao:
    [],

  linhaReviews:
    null,

  pontoReviews:
    null,

  filtroReviews:
    0,

  linhaFlash:
    null,

  pontoFlash:
    null,

  reclamacaoFotos:
    [],

  inputMestreReclamacao:
    null,

  lugarId:
    null,

  lugarLat:
    null,

  lugarLon:
    null,

  marcandoLugar:
    false,

  marcadorLugar:
    null,

  perfilFotoTemporaria:
    "",

  usuario:
    null,

  navegacao: {
    watchId:
      null,

    linhaMapa:
      null,

    marcadorPonto:
      null,

    marcadorUsuario:
      null,

    ponto:
      null,

    linhaOnibus:
      null,

    ultimaRotaLat:
      null,

    ultimaRotaLon:
      null,

    ultimaRotaEm:
      0,

    recalculando:
      false
  }
};


const cacheBusca =
  new Map();


const cacheLinhas =
  new Map();


const cacheLocais =
  new Map();


const historicoPrevisoes =
  new Map();


/* =========================================================
   UTILIDADES
========================================================= */

function esc(
  value = ""
) {
  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );
}


function norm(
  value = ""
) {
  return String(value)

    .trim()

    .toUpperCase()

    .replace(
      /\s+/g,
      " "
    );
}


function normBusca(
  value = ""
) {
  return String(value)

    .normalize(
      "NFD"
    )

    .replace(
      /[\u0300-\u036f]/g,
      ""
    )

    .toUpperCase()

    .trim()

    .replace(
      /\s+/g,
      " "
    );
}


function gerarId() {
  return (
    globalThis.crypto
      ?.randomUUID?.()

    ||

    `${Date.now()}-${Math.random()}`
  );
}


function lerStorage(
  chave,
  padrao = []
) {
  try {
    return (
      JSON.parse(
        localStorage.getItem(
          chave
        )
        ||
        "null"
      )

      ??

      padrao
    );
  }

  catch {
    return padrao;
  }
}


function salvarStorage(
  chave,
  valor
) {
  try {
    localStorage.setItem(
      chave,
      JSON.stringify(
        valor
      )
    );


    return true;
  }

  catch (erro) {
    console.warn(
      "Não foi possível salvar localmente:",
      erro
    );


    return false;
  }
}


function isAbort(
  erro
) {
  return (
    erro?.name ===
    "AbortError"
  );
}


function cacheGet(
  mapa,
  chave,
  ttl
) {
  const item =
    mapa.get(
      chave
    );


  if (
    !item
  ) {
    return null;
  }


  if (
    Date.now()
    -
    item.criadoEm
    >
    ttl
  ) {
    mapa.delete(
      chave
    );


    return null;
  }


  return item.dados;
}


function cacheSet(
  mapa,
  chave,
  dados
) {
  mapa.set(
    chave,
    {
      criadoEm:
        Date.now(),

      dados
    }
  );


  return dados;
}


function extrairLista(
  dados,
  ...chaves
) {
  if (
    Array.isArray(
      dados
    )
  ) {
    return dados;
  }


  for (
    const chave
    of
    chaves
  ) {
    if (
      Array.isArray(
        dados?.[chave]
      )
    ) {
      return dados[chave];
    }
  }


  return [];
}


/* =========================================================
   API
========================================================= */

async function api(
  url,
  options = {}
) {
  const resposta =
    await fetch(
      url,
      options
    );


  if (
    !resposta.ok
  ) {
    let mensagem =
      "";


    try {
      const corpo =
        await resposta.json();


      mensagem =
        corpo?.erro
        ||
        corpo?.error
        ||
        corpo?.message
        ||
        "";
    }

    catch {}


    const erro =
      new Error(
        mensagem
        ||
        `${resposta.status} ${resposta.statusText}`
      );


    erro.status =
      resposta.status;


    throw erro;
  }


  if (
    resposta.status ===
    204
  ) {
    return null;
  }


  return resposta.json();
}


/* =========================================================
   PONTOS E LINHAS
========================================================= */

function codigoPonto(
  ponto
) {
  return String(
    ponto?.gtfsStopId
    ||
    ponto?.stopId
    ||
    ponto?.cp
    ||
    ponto?.codigo
    ||
    ponto?.id
    ||
    ""
  );
}


function idPonto(
  ponto
) {
  return (
    codigoPonto(
      ponto
    )

    ||

    `${ponto?.py}|${ponto?.px}`
  );
}


function nomePonto(
  ponto
) {
  return String(
    ponto?.np
    ||
    ponto?.nome
    ||
    ponto?.name
    ||
    "Ponto de ônibus"
  );
}


function enderecoPonto(
  ponto
) {
  return String(
    ponto?.ed
    ||
    ponto?.endereco
    ||
    ponto?.address
    ||
    ""
  );
}


function numeroLinha(
  linha
) {
  return String(
    linha?.letreiro
    ||
    linha?.numero
    ||
    linha?.codigo
    ||
    linha?.linha
    ||
    "Linha"
  );
}


function prefixo(
  previsao
) {
  return String(
    previsao?.prefixo
    ??
    previsao?.p
    ??
    previsao?.veiculo
    ??
    ""
  )
    .trim();
}


function destino(
  linha
) {
  if (
    Number(
      linha?.sentido
    ) ===
    2
  ) {
    return String(
      linha?.origem
      ||
      linha?.destino
      ||
      linha?.headsign
      ||
      "Destino não informado"
    );
  }


  return String(
    linha?.destino
    ||
    linha?.headsign
    ||
    linha?.origem
    ||
    "Destino não informado"
  );
}


function sentidoLinha(
  linha
) {
  return destino(
    linha
  );
}


function chaveServico(
  linha
) {
  return (
    `${norm(
      numeroLinha(
        linha
      )
    )}|${
      Number(
        linha?.sentido
      )
      ||
      "x"
    }`
  );
}


function chaveLinha(
  linha
) {
  return (
    `${chaveServico(linha)}|${norm(
      destino(
        linha
      )
    )}`
  );
}


function normalizarCodigoLinha(
  value
) {
  return normBusca(
    value
  )

    .replace(
      /[–—]/g,
      "-"
    )

    .replace(
      /\s+/g,
      ""
    )

    .replace(
      /[^0-9A-Z-]/g,
      ""
    );
}


function pareceCodigoLinha(
  value
) {
  return (
    /^[0-9]{1,5}[A-Z]?(?:-[0-9A-Z]{1,4})?$/i

      .test(
        normalizarCodigoLinha(
          value
        )
      )
  );
}


/* =========================================================
   DISTÂNCIA
========================================================= */

function distanciaMetros(
  lat1,
  lon1,
  lat2,
  lon2
) {
  const R =
    6371000;


  const p1 =
    Number(
      lat1
    )
    *
    Math.PI
    /
    180;


  const p2 =
    Number(
      lat2
    )
    *
    Math.PI
    /
    180;


  const dLat =
    (
      Number(
        lat2
      )
      -
      Number(
        lat1
      )
    )
    *
    Math.PI
    /
    180;


  const dLon =
    (
      Number(
        lon2
      )
      -
      Number(
        lon1
      )
    )
    *
    Math.PI
    /
    180;


  const a =
    Math.sin(
      dLat /
      2
    ) ** 2

    +

    Math.cos(
      p1
    )

    *

    Math.cos(
      p2
    )

    *

    Math.sin(
      dLon /
      2
    ) ** 2;


  return (
    R
    *
    2
    *
    Math.atan2(
      Math.sqrt(
        a
      ),

      Math.sqrt(
        1 -
        a
      )
    )
  );
}


function formatarDistancia(
  metros
) {
  if (
    !Number.isFinite(
      metros
    )
  ) {
    return "";
  }


  if (
    metros <
    1000
  ) {
    return (
      `${Math.round(
        metros
      )} m`
    );
  }


  return (
    `${
      (
        metros /
        1000
      )

        .toFixed(
          metros <
          10000
            ? 1
            : 0
        )

        .replace(
          ".",
          ","
        )
    } km`
  );
}


function ordenarPontosPorDistancia(
  pontos,
  lat = state.lat,
  lon = state.lon
) {
  if (
    !Number.isFinite(
      lat
    )
    ||
    !Number.isFinite(
      lon
    )
  ) {
    return arr(
      pontos
    );
  }


  return arr(
    pontos
  )

    .filter(
      ponto =>

        Number.isFinite(
          Number(
            ponto.py
          )
        )

        &&

        Number.isFinite(
          Number(
            ponto.px
          )
        )
    )

    .map(
      ponto => ({
        ...ponto,

        distanciaCalculada:
          distanciaMetros(
            lat,
            lon,
            Number(
              ponto.py
            ),
            Number(
              ponto.px
            )
          )
      })
    )

    .sort(
      (
        a,
        b
      ) =>
        a.distanciaCalculada
        -
        b.distanciaCalculada
    );
}


/* =========================================================
   MAPA
========================================================= */

if (
  typeof L ===
  "undefined"
) {
  throw new Error(
    "Leaflet não foi carregado."
  );
}


if (
  !$(
    "map"
  )
) {
  throw new Error(
    "Elemento #map não encontrado."
  );
}


const LIMITES_SP =
  L.latLngBounds(
    [
      -24.03,
      -46.83
    ],

    [
      -23.35,
      -46.36
    ]
  );


const CENTRO_SP = [
  -23.5505,
  -46.6333
];


function dentroDeSaoPaulo(
  lat,
  lon
) {
  const latitude =
    Number(
      lat
    );


  const longitude =
    Number(
      lon
    );


  return (
    Number.isFinite(
      latitude
    )

    &&

    Number.isFinite(
      longitude
    )

    &&

    LIMITES_SP.contains(
      L.latLng(
        latitude,
        longitude
      )
    )
  );
}


const map =
  L.map(
    "map",
    {
      zoomControl:
        true,

      maxBounds:
        LIMITES_SP,

      maxBoundsViscosity:
        1,

      minZoom:
        CONFIG.minZoomSP,

      maxZoom:
        CONFIG.maxZoomSP,

      preferCanvas:
        true,

      zoomAnimation:
        false,

      fadeAnimation:
        false,

      markerZoomAnimation:
        false,

      inertia:
        false,

      keyboard:
        false,

      zoomSnap:
        0.5,

      zoomDelta:
        0.5,

      wheelDebounceTime:
        100,

      wheelPxPerZoomLevel:
        100
    }
  )

    .setView(
      CENTRO_SP,
      13
    );


L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution:
      "&copy; OpenStreetMap contributors",

    minZoom:
      CONFIG.minZoomSP,

    maxZoom:
      CONFIG.maxZoomSP,

    updateWhenIdle:
      true,

    updateWhenZooming:
      false,

    keepBuffer:
      1,

    detectRetina:
      false
  }
)

  .addTo(
    map
  );


map.createPane(
  "busStopsPane"
);


const busStopsPane =
  map.getPane(
    "busStopsPane"
  );


if (
  busStopsPane
) {
  busStopsPane.style.zIndex =
    "620";
}


state.layerPontos =
  L.layerGroup()

    .addTo(
      map
    );


/* =========================================================
   LIMITES DO MAPA
========================================================= */

let timerResize =
  null;


function ajustarZoomMinimoSP() {
  const zoom =
    map.getBoundsZoom(
      LIMITES_SP,
      false,
      [
        10,
        10
      ]
    );


  const minimo =
    Math.max(
      CONFIG.minZoomSP,
      zoom
    );


  map.setMinZoom(
    minimo
  );


  if (
    map.getZoom() <
    minimo
  ) {
    map.setZoom(
      minimo,
      {
        animate:
          false
      }
    );
  }


  map.panInsideBounds(
    LIMITES_SP,
    {
      animate:
        false
    }
  );
}


map.whenReady(
  ajustarZoomMinimoSP
);


window.addEventListener(
  "resize",
  () => {

    clearTimeout(
      timerResize
    );


    timerResize =
      setTimeout(
        ajustarZoomMinimoSP,
        160
      );

  },
  {
    passive:
      true
  }
);


/* =========================================================
   DIREÇÃO DOS PONTOS
========================================================= */

function setaPorAngulo(
  angulo
) {
  let graus =
    Number(
      angulo
    );


  if (
    !Number.isFinite(
      graus
    )
  ) {
    return null;
  }


  graus =
    (
      (
        graus %
        360
      )
      +
      360
    )
    %
    360;


  if (
    graus >=
    337.5
    ||
    graus <
    22.5
  ) {
    return "↑";
  }


  if (
    graus <
    67.5
  ) {
    return "↗";
  }


  if (
    graus <
    112.5
  ) {
    return "→";
  }


  if (
    graus <
    157.5
  ) {
    return "↘";
  }


  if (
    graus <
    202.5
  ) {
    return "↓";
  }


  if (
    graus <
    247.5
  ) {
    return "↙";
  }


  if (
    graus <
    292.5
  ) {
    return "←";
  }


  return "↖";
}


function setaPonto(
  ponto
) {
  const porAngulo =
    setaPorAngulo(
      ponto?.bearing
      ??
      ponto?.heading
      ??
      ponto?.azimute
      ??
      ponto?.angulo
    );


  if (
    porAngulo
  ) {
    return porAngulo;
  }


  const sentido =
    normBusca(
      ponto?.sentido
      ??
      ponto?.direcao
      ??
      ponto?.direction
      ??
      ponto?.sentidoId
      ??
      ""
    );


  if (
    sentido ===
    "1"
    ||
    sentido ===
    "IDA"
    ||
    sentido.includes(
      "IDA"
    )
    ||
    sentido ===
    "A"
  ) {
    return "→";
  }


  if (
    sentido ===
    "2"
    ||
    sentido ===
    "VOLTA"
    ||
    sentido.includes(
      "VOLTA"
    )
    ||
    sentido ===
    "B"
  ) {
    return "←";
  }


  return "↔";
}


function classeSetaPonto(
  seta
) {
  if (
    [
      "←",
      "↖",
      "↙"
    ]
      .includes(
        seta
      )
  ) {
    return "seta-esquerda";
  }


  if (
    [
      "→",
      "↗",
      "↘"
    ]
      .includes(
        seta
      )
  ) {
    return "seta-direita";
  }


  if (
    seta ===
    "↑"
  ) {
    return "seta-cima";
  }


  if (
    seta ===
    "↓"
  ) {
    return "seta-baixo";
  }


  return "seta-dupla";
}


/* =========================================================
   ÍCONE DOS ÔNIBUS
========================================================= */

function iconePontoAzul(
  ponto,
  selecionado = false
) {
  const seta =
    setaPonto(
      ponto
    );


  return L.divIcon({
    className:
      "busreview-leaflet-stop",

    html: `

      <div
        class="
          busreview-stop-wrapper
          ${selecionado ? "selecionado" : ""}
        "
      >

        <div class="busreview-stop-pin">

          <div class="busreview-stop-bus">

            <div class="bus-window"></div>

            <i class="bus-light l"></i>
            <i class="bus-light r"></i>

            <i class="bus-wheel l"></i>
            <i class="bus-wheel r"></i>

          </div>

        </div>


        <div
          class="
            busreview-stop-direction
            ${classeSetaPonto(seta)}
          "
        >

          ${seta}

        </div>

      </div>

    `,

    iconSize:
      selecionado

        ? [
            54,
            58
          ]

        : [
            46,
            50
          ],

    iconAnchor:
      selecionado

        ? [
            27,
            56
          ]

        : [
            23,
            48
          ],

    tooltipAnchor:
      [
        0,
        -42
      ]
  });
}


const tempPlaceIcon =
  L.divIcon({
    className:
      "",

    html:
      `<div class="temp-place-marker">+</div>`,

    iconSize:
      [
        38,
        38
      ],

    iconAnchor:
      [
        19,
        19
      ]
  });


/* =========================================================
   PERFIL LOCAL
========================================================= */

function carregarPerfilLocal() {
  const perfil =
    lerStorage(
      CONFIG.storage.perfil,
      null
    );


  if (
    !perfil
    ||
    !perfil.id
    ||
    !perfil.nome
  ) {
    return null;
  }


  return {
    id:
      String(
        perfil.id
      ),

    nome:
      String(
        perfil.nome
      ),

    foto:
      String(
        perfil.foto
        ||
        ""
      )
  };
}


function usuarioLogado() {
  return Boolean(
    state.usuario?.id
    &&
    state.usuario?.nome
  );
}


function fotoUsuario() {
  return (
    state.usuario?.foto
    ||
    ""
  );
}


function criarUserIcon() {
  const foto =
    fotoUsuario();


  return L.divIcon({
    className:
      "",

    html:
      foto

        ? `
          <div class="user-marker-foto">

            <img
              src="${esc(foto)}"
              alt=""
            >

          </div>
        `

        : `
          <div class="user-marker-padrao">

            <span></span>

          </div>
        `,

    iconSize:
      foto

        ? [
            44,
            44
          ]

        : [
            30,
            30
          ],

    iconAnchor:
      foto

        ? [
            22,
            22
          ]

        : [
            15,
            15
          ]
  });
}


function atualizarIconeUsuario() {
  state.userMarker
    ?.setIcon(
      criarUserIcon()
    );
}


/* =========================================================
   ARQUIVOS / IMAGENS
========================================================= */

function escolherArquivo({
  camera = false,
  multiple = false
} = {}) {
  return new Promise(
    resolve => {

      const input =
        document.createElement(
          "input"
        );


      input.type =
        "file";


      input.accept =
        "image/*";


      input.multiple =
        multiple;


      if (
        camera
      ) {
        input.setAttribute(
          "capture",
          "environment"
        );
      }


      input.onchange =
        () =>
          resolve(
            [
              ...input.files
            ]
          );


      input.click();

    }
  );
}


function imagemDataURL(
  file,
  max = 720,
  qualidade = 0.72,
  quadrada = false
) {
  return new Promise(
    (
      resolve,
      reject
    ) => {

      const reader =
        new FileReader();


      reader.onerror =
        reject;


      reader.onload =
        evento => {

          const img =
            new Image();


          img.onerror =
            reject;


          img.onload =
            () => {

              const canvas =
                document.createElement(
                  "canvas"
                );


              const ctx =
                canvas.getContext(
                  "2d"
                );


              if (
                !ctx
              ) {
                reject(
                  new Error(
                    "Canvas indisponível."
                  )
                );


                return;
              }


              if (
                quadrada
              ) {
                const lado =
                  Math.min(
                    img.naturalWidth,
                    img.naturalHeight
                  );


                canvas.width =
                  max;


                canvas.height =
                  max;


                ctx.drawImage(
                  img,

                  (
                    img.naturalWidth -
                    lado
                  ) /
                  2,

                  (
                    img.naturalHeight -
                    lado
                  ) /
                  2,

                  lado,
                  lado,

                  0,
                  0,

                  max,
                  max
                );
              }

              else {
                const escala =
                  Math.min(
                    1,

                    max /
                    img.naturalWidth,

                    max /
                    img.naturalHeight
                  );


                const largura =
                  Math.max(
                    1,

                    Math.round(
                      img.naturalWidth *
                      escala
                    )
                  );


                const altura =
                  Math.max(
                    1,

                    Math.round(
                      img.naturalHeight *
                      escala
                    )
                  );


                canvas.width =
                  largura;


                canvas.height =
                  altura;


                ctx.drawImage(
                  img,
                  0,
                  0,
                  largura,
                  altura
                );
              }


              resolve(
                canvas.toDataURL(
                  "image/jpeg",
                  qualidade
                )
              );

            };


          img.src =
            evento.target.result;

        };


      reader.readAsDataURL(
        file
      );

    }
  );
}


/* =========================================================
   LOGIN INTERNO
========================================================= */

function garantirAuthUI() {
  if (
    !$(
      "busreviewAuth"
    )
  ) {
    const auth =
      document.createElement(
        "div"
      );


    auth.id =
      "busreviewAuth";


    auth.className =
      "busreview-auth";


    auth.innerHTML =
      `<div id="busreviewAuthConteudo"></div>`;


    $("menu-lateral")
      ?.prepend(
        auth
      );
  }


  if (
    $(
      "modalLoginLocal"
    )
  ) {
    return;
  }


  const modal =
    document.createElement(
      "div"
    );


  modal.id =
    "modalLoginLocal";


  modal.className =
    "auth-modal-fundo oculto";


  modal.innerHTML = `

    <div class="auth-modal">

      <button
        id="fecharModalLoginLocal"
        class="auth-fechar"
        type="button"
        aria-label="Fechar"
      >

        ×

      </button>


      <h2>

        Entrar no BusReview

      </h2>


      <p class="perfil-local-texto">

        Escolha um nome e, se quiser,
        uma foto de perfil.

        Não precisa criar conta.

      </p>


      <button
        id="fotoPerfilLocalBtn"
        class="perfil-foto-botao"
        type="button"
      >

        <span
          id="previewFotoPerfilLocal"
          class="perfil-foto-preview"
        >

          👤

        </span>


        <span>

          Escolher foto

        </span>

      </button>


      <label
        class="perfil-local-label"
        for="nomePerfilLocal"
      >

        Nome de usuário

      </label>


      <input
        id="nomePerfilLocal"
        class="perfil-local-input"
        type="text"
        maxlength="30"
        autocomplete="nickname"
        placeholder="Ex.: João"
      >


      <button
        id="salvarPerfilLocalBtn"
        class="perfil-local-salvar"
        type="button"
      >

        Entrar

      </button>


      <small class="perfil-local-aviso">

        Seu perfil fica salvo apenas neste navegador.

      </small>

    </div>

  `;


  document.body
    .appendChild(
      modal
    );


  $("fecharModalLoginLocal")
    .onclick =
    fecharLoginLocal;


  $("fotoPerfilLocalBtn")
    .onclick =
    selecionarFotoPerfilLogin;


  $("salvarPerfilLocalBtn")
    .onclick =
    salvarPerfilLocal;


  $("nomePerfilLocal")
    .addEventListener(
      "keydown",
      evento => {

        if (
          evento.key ===
          "Enter"
        ) {
          salvarPerfilLocal();
        }

      }
    );
}


function renderAuth() {
  garantirAuthUI();


  const box =
    $("busreviewAuthConteudo");


  if (
    !box
  ) {
    return;
  }


  if (
    !usuarioLogado()
  ) {
    box.innerHTML = `

      <button
        id="abrirLoginLocalBtn"
        class="perfil-menu-login"
        type="button"
      >

        👤 Entrar no BusReview

      </button>

    `;


    $("abrirLoginLocalBtn")
      .onclick =
      abrirLoginLocal;


    return;
  }


  const usuario =
    state.usuario;


  box.innerHTML = `

    <div class="auth-logado">

      ${
        usuario.foto

          ? `
            <img
              src="${esc(usuario.foto)}"
              alt=""
            >
          `

          : `
            <div class="auth-avatar">

              ${esc(
                usuario.nome[0]
                  .toUpperCase()
              )}

            </div>
          `
      }


      <div class="auth-dados">

        <strong>

          ${esc(
            usuario.nome
          )}

        </strong>


        <small>

          Perfil local

        </small>

      </div>


      <button
        id="editarPerfilLocalBtn"
        type="button"
      >

        Editar

      </button>


      <button
        id="logoutLocalBtn"
        type="button"
      >

        Sair

      </button>

    </div>

  `;


  $("editarPerfilLocalBtn")
    .onclick =
    abrirLoginLocal;


  $("logoutLocalBtn")
    .onclick =
    logoutLocal;
}


function atualizarPreviewPerfil() {
  const preview =
    $("previewFotoPerfilLocal");


  if (
    !preview
  ) {
    return;
  }


  preview.innerHTML =
    state.perfilFotoTemporaria

      ? `
        <img
          src="${esc(state.perfilFotoTemporaria)}"
          alt=""
        >
      `

      : "👤";
}


function abrirLoginLocal() {
  garantirAuthUI();


  state.perfilFotoTemporaria =
    state.usuario?.foto
    ||
    "";


  if (
    $("nomePerfilLocal")
  ) {
    $("nomePerfilLocal")
      .value =
      state.usuario?.nome
      ||
      "";
  }


  atualizarPreviewPerfil();


  $("modalLoginLocal")
    ?.classList
    .remove(
      "oculto"
    );


  setTimeout(
    () =>
      $("nomePerfilLocal")
        ?.focus(),

    50
  );
}


function fecharLoginLocal() {
  $("modalLoginLocal")
    ?.classList
    .add(
      "oculto"
    );
}


async function selecionarFotoPerfilLogin() {
  const [
    file
  ] =
    await escolherArquivo();


  if (
    !file
  ) {
    return;
  }


  if (
    !file.type
      .startsWith(
        "image/"
      )

    ||

    file.size >
    CONFIG.maxFotoBytes
  ) {
    alert(
      "Escolha uma imagem de até 8 MB."
    );


    return;
  }


  try {
    state.perfilFotoTemporaria =
      await imagemDataURL(
        file,
        256,
        0.82,
        true
      );


    atualizarPreviewPerfil();
  }

  catch {
    alert(
      "Não foi possível carregar essa imagem."
    );
  }
}


function salvarPerfilLocal() {
  const nome =
    $("nomePerfilLocal")
      ?.value
      .trim()
    ||
    "";


  if (
    nome.length <
    2
  ) {
    alert(
      "Digite um nome de usuário com pelo menos 2 caracteres."
    );


    return;
  }


  const perfil = {
    id:
      state.usuario?.id
      ||
      gerarId(),

    nome,

    foto:
      state.perfilFotoTemporaria
      ||
      ""
  };


  if (
    !salvarStorage(
      CONFIG.storage.perfil,
      perfil
    )
  ) {
    alert(
      "Não foi possível salvar o perfil neste navegador."
    );


    return;
  }


  state.usuario =
    perfil;


  fecharLoginLocal();


  renderAuth();


  atualizarIconeUsuario();


  renderizarLugaresMenu();
}


function logoutLocal() {
  localStorage.removeItem(
    CONFIG.storage.perfil
  );


  state.usuario =
    null;


  state.perfilFotoTemporaria =
    "";


  renderAuth();


  atualizarIconeUsuario();


  renderizarLugaresMenu();
}


function exigirPerfilLocal() {
  if (
    usuarioLogado()
  ) {
    return true;
  }


  abrirLoginLocal();


  return false;
}


/* =========================================================
   PREVISÕES
========================================================= */

function minutosAte(
  horario
) {
  if (
    !horario
  ) {
    return null;
  }


  const [
    hora,
    minuto
  ] =
    String(
      horario
    )

      .split(
        ":"
      )

      .map(
        Number
      );


  if (
    !Number.isFinite(
      hora
    )
    ||
    !Number.isFinite(
      minuto
    )
  ) {
    return null;
  }


  const chegada =
    new Date();


  chegada.setHours(
    hora,
    minuto,
    0,
    0
  );


  if (
    chegada.getTime()
    <
    Date.now()
    -
    60_000
  ) {
    chegada.setDate(
      chegada.getDate()
      +
      1
    );
  }


  return Math.max(
    0,

    Math.round(
      (
        chegada.getTime()
        -
        Date.now()
      )
      /
      60_000
    )
  );
}


function previsoes(
  linha
) {
  return arr(
    linha?.previsoes
  )

    .map(
      previsao => ({
        ...previsao,

        minutos:
          minutosAte(
            previsao.horario
          )
      })
    )

    .filter(
      previsao =>

        previsao.minutos !==
        null

        &&

        previsao.minutos >=
        0

        &&

        previsao.minutos <=
        CONFIG.limitePrevisaoMin
    )

    .sort(
      (
        a,
        b
      ) =>
        a.minutos -
        b.minutos
    );
}


function estadoPrevisao(
  linha,
  previsao
) {
  const chave =
    `${chaveServico(linha)}|${prefixo(previsao)}`;


  const agora =
    Date.now();


  const anterior =
    historicoPrevisoes.get(
      chave
    );


  let amareloAte =
    anterior?.amareloAte
    ||
    0;


  if (
    anterior?.horario
    &&
    anterior.horario !==
    previsao.horario
  ) {
    amareloAte =
      agora +
      CONFIG.amareloMs;
  }


  historicoPrevisoes.set(
    chave,
    {
      horario:
        previsao.horario,

      amareloAte
    }
  );


  if (
    amareloAte >
    agora
  ) {
    return [
      "previsao-amarela",
      "Previsão alterada"
    ];
  }


  if (
    previsao.minutos <=
    CONFIG.limiteVerdeMin
  ) {
    return [
      "previsao-verde",
      "Chegando em breve"
    ];
  }


  return [
    "previsao-vermelha",
    "Horário previsto"
  ];
}


/* =========================================================
   API DE TRANSPORTE
========================================================= */

async function buscarParadasApi(
  lat,
  lon,
  raio = CONFIG.raioMapaKm,
  signal
) {
  const dados =
    await api(
      `/api/paradas` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&raio=${encodeURIComponent(raio)}`,

      signal

        ? {
            signal
          }

        : {}
    );


  return extrairLista(
    dados,
    "paradas",
    "pontos",
    "results"
  );
}


async function consultarLinhasParada(
  ponto,
  usarCache = true
) {
  const codigo =
    codigoPonto(
      ponto
    );


  if (
    !codigo
  ) {
    throw new Error(
      "Ponto sem código."
    );
  }


  const antigo =
    cacheLinhas.get(
      codigo
    );


  if (
    usarCache
    &&
    antigo?.dados
    &&
    Date.now()
    -
    antigo.criadoEm
    <
    CONFIG.cacheLinhasMs
  ) {
    return antigo.dados;
  }


  if (
    antigo?.promessa
  ) {
    return antigo.promessa;
  }


  const promessa =
    api(
      `/api/paradas/${encodeURIComponent(codigo)}/linhas`
    )

      .then(
        dados => {

          const normalizado =
            Array.isArray(
              dados
            )

              ? {
                  linhas:
                    dados
                }

              : {
                  ...dados,

                  linhas:
                    extrairLista(
                      dados,
                      "linhas",
                      "results"
                    )
                };


          cacheLinhas.set(
            codigo,
            {
              criadoEm:
                Date.now(),

              dados:
                normalizado,

              promessa:
                null
            }
          );


          return normalizado;

        }
      )

      .catch(
        erro => {

          cacheLinhas.delete(
            codigo
          );


          throw erro;

        }
      );


  cacheLinhas.set(
    codigo,
    {
      criadoEm:
        antigo?.criadoEm
        ||
        0,

      dados:
        antigo?.dados
        ||
        null,

      promessa
    }
  );


  return promessa;
}


/* =========================================================
   MAPA / PERFORMANCE
========================================================= */

function espacamentoPontosPx() {
  const zoom =
    map.getZoom();


  if (
    zoom <
    CONFIG.zoomMinimoMostrarPontos
  ) {
    return 9999;
  }


  if (
    zoom <
    16
  ) {
    return 105;
  }


  if (
    zoom <
    17
  ) {
    return 78;
  }


  if (
    zoom <
    18
  ) {
    return 58;
  }


  if (
    zoom <
    19
  ) {
    return 40;
  }


  return 29;
}


function maxPontosRender() {
  const zoom =
    map.getZoom();


  if (
    zoom <
    CONFIG.zoomMinimoMostrarPontos
  ) {
    return 0;
  }


  if (
    zoom <
    16
  ) {
    return 12;
  }


  if (
    zoom <
    17
  ) {
    return 25;
  }


  if (
    zoom <
    18
  ) {
    return 45;
  }


  if (
    zoom <
    19
  ) {
    return 75;
  }


  return 110;
}


function selecionarPontosParaRender() {
  if (
    state.modoNavegacao
    ||
    !state.pontos.length
    ||
    map.getZoom()
    <
    CONFIG.zoomMinimoMostrarPontos
  ) {
    return [];
  }


  const bounds =
    map
      .getBounds()
      .pad(
        0.025
      );


  const spacing =
    espacamentoPontosPx();


  const limite =
    maxPontosRender();


  const selecionado =
    state.pontoSelecionadoId;


  const grid =
    new Map();


  const escolhidos =
    [];


  for (
    let i = 0;

    i <
    state.pontos.length
    &&
    escolhidos.length <
    limite;

    i++
  ) {
    const ponto =
      state.pontos[i];


    const lat =
      Number(
        ponto.py
      );


    const lon =
      Number(
        ponto.px
      );


    if (
      !Number.isFinite(
        lat
      )
      ||
      !Number.isFinite(
        lon
      )
      ||
      !bounds.contains(
        [
          lat,
          lon
        ]
      )
    ) {
      continue;
    }


    const id =
      idPonto(
        ponto
      );


    if (
      id ===
      selecionado
    ) {
      escolhidos.unshift(
        ponto
      );


      continue;
    }


    const pixel =
      map.latLngToContainerPoint(
        [
          lat,
          lon
        ]
      );


    const gx =
      Math.floor(
        pixel.x /
        spacing
      );


    const gy =
      Math.floor(
        pixel.y /
        spacing
      );


    let bloqueado =
      false;


    for (
      let dx = -1;

      dx <= 1
      &&
      !bloqueado;

      dx++
    ) {
      for (
        let dy = -1;

        dy <= 1
        &&
        !bloqueado;

        dy++
      ) {
        const vizinhos =
          grid.get(
            `${gx + dx}|${gy + dy}`
          );


        if (
          !vizinhos
        ) {
          continue;
        }


        for (
          const vizinho
          of
          vizinhos
        ) {
          if (
            pixel.distanceTo(
              vizinho
            )
            <
            spacing
          ) {
            bloqueado =
              true;


            break;
          }
        }
      }
    }


    if (
      bloqueado
    ) {
      continue;
    }


    escolhidos.push(
      ponto
    );


    const chave =
      `${gx}|${gy}`;


    const celula =
      grid.get(
        chave
      )
      ||
      [];


    celula.push(
      pixel
    );


    grid.set(
      chave,
      celula
    );
  }


  return escolhidos
    .slice(
      0,
      limite
    );
}


function criarMarkerPonto(
  ponto
) {
  const id =
    idPonto(
      ponto
    );


  const marker =
    L.marker(
      [
        Number(
          ponto.py
        ),

        Number(
          ponto.px
        )
      ],
      {
        icon:
          iconePontoAzul(
            ponto,

            id ===
            state.pontoSelecionadoId
          ),

        pane:
          "busStopsPane",

        riseOnHover:
          true,

        keyboard:
          false
      }
    );


  marker._busReviewSelecionado =
    id ===
    state.pontoSelecionadoId;


  marker.bindTooltip(
    nomePonto(
      ponto
    ),
    {
      direction:
        "top",

      offset:
        [
          0,
          -42
        ]
    }
  );


  marker.on(
    "click",
    evento => {

      if (
        evento.originalEvent
      ) {
        L.DomEvent.stopPropagation(
          evento.originalEvent
        );
      }


      state.linhaPesquisaSelecionada =
        null;


      state.pontoSelecionadoId =
        id;


      renderizarPontosMapa();


      abrirPonto(
        ponto
      );

    }
  );


  return marker;
}


function limparMarkersPontos() {
  if (
    !state.markers.size
  ) {
    return;
  }


  state.layerPontos
    ?.clearLayers();


  state.markers
    .clear();
}


function renderizarPontosMapa() {
  if (
    state.modoNavegacao
    ||
    map.getZoom()
    <
    CONFIG.zoomMinimoMostrarPontos
  ) {
    limparMarkersPontos();


    return;
  }


  const desejados =
    selecionarPontosParaRender();


  const ids =
    new Set(
      desejados.map(
        idPonto
      )
    );


  for (
    const [
      id,
      marker
    ]
    of
    state.markers
  ) {
    if (
      !ids.has(
        id
      )
    ) {
      state.layerPontos
        .removeLayer(
          marker
        );


      state.markers
        .delete(
          id
        );
    }
  }


  for (
    const ponto
    of
    desejados
  ) {
    const id =
      idPonto(
        ponto
      );


    const selecionado =
      id ===
      state.pontoSelecionadoId;


    const existente =
      state.markers.get(
        id
      );


    if (
      existente
    ) {
      if (
        existente._busReviewSelecionado !==
        selecionado
      ) {
        existente.setIcon(
          iconePontoAzul(
            ponto,
            selecionado
          )
        );


        existente._busReviewSelecionado =
          selecionado;
      }


      continue;
    }


    const marker =
      criarMarkerPonto(
        ponto
      );


    marker.addTo(
      state.layerPontos
    );


    state.markers.set(
      id,
      marker
    );
  }
}


function agendarRenderPontos() {
  if (
    state.modoNavegacao
  ) {
    return;
  }


  clearTimeout(
    state.renderTimer
  );


  state.renderTimer =
    setTimeout(
      () =>
        requestAnimationFrame(
          renderizarPontosMapa
        ),

      180
    );
}


map.on(
  "zoomstart",
  () => {

    state.zoomEmAndamento =
      true;


    const pane =
      map.getPane(
        "busStopsPane"
      );


    if (
      pane
    ) {
      pane.style.display =
        "none";
    }

  }
);


map.on(
  "zoomend",
  () => {

    state.zoomEmAndamento =
      false;


    const pane =
      map.getPane(
        "busStopsPane"
      );


    if (
      pane
    ) {
      pane.style.display =
        "";
    }


    agendarRenderPontos();

  }
);


map.on(
  "moveend",
  () => {

    if (
      !state.zoomEmAndamento
    ) {
      agendarRenderPontos();
    }

  }
);


/* =========================================================
   PONTOS PRÓXIMOS
========================================================= */

async function criarPontosPerto(
  forcar = false
) {
  if (
    state.carregandoPontos
    ||
    state.modoNavegacao
    ||
    !Number.isFinite(
      state.lat
    )
    ||
    !Number.isFinite(
      state.lon
    )
  ) {
    return;
  }


  if (
    !dentroDeSaoPaulo(
      state.lat,
      state.lon
    )
  ) {
    state.pontos =
      [];


    limparMarkersPontos();


    return;
  }


  if (
    !forcar
    &&
    Number.isFinite(
      state.ultimaBuscaPontosLat
    )
    &&
    distanciaMetros(
      state.ultimaBuscaPontosLat,
      state.ultimaBuscaPontosLon,
      state.lat,
      state.lon
    )
    <
    CONFIG.deslocamentoAtualizarPontosM
  ) {
    renderizarPontosMapa();


    return;
  }


  state.carregandoPontos =
    true;


  try {
    const pontos =
      await buscarParadasApi(
        state.lat,
        state.lon,
        CONFIG.raioMapaKm
      );


    state.pontos =
      ordenarPontosPorDistancia(
        pontos
      );


    state.ultimaBuscaPontosLat =
      state.lat;


    state.ultimaBuscaPontosLon =
      state.lon;


    renderizarPontosMapa();
  }

  catch (erro) {
    console.warn(
      "Não foi possível carregar os pontos próximos:",
      erro
    );
  }

  finally {
    state.carregandoPontos =
      false;
  }
}


/* =========================================================
   GPS
========================================================= */

function atualizarLocalizacao(
  lat,
  lon
) {
  state.lat =
    Number(
      lat
    );


  state.lon =
    Number(
      lon
    );


  if (
    !Number.isFinite(
      state.lat
    )
    ||
    !Number.isFinite(
      state.lon
    )
  ) {
    return;
  }


  if (
    !state.userMarker
  ) {
    state.userMarker =
      L.marker(
        [
          state.lat,
          state.lon
        ],
        {
          icon:
            criarUserIcon(),

          zIndexOffset:
            3000,

          keyboard:
            false
        }
      )

        .bindTooltip(
          "Você está aqui"
        );


    if (
      !state.modoNavegacao
      &&
      dentroDeSaoPaulo(
        state.lat,
        state.lon
      )
    ) {
      state.userMarker
        .addTo(
          map
        );
    }


    state.userMarker.on(
      "click",
      abrirLoginLocal
    );
  }

  else {
    state.userMarker
      .setLatLng(
        [
          state.lat,
          state.lon
        ]
      );
  }


  if (
    state.primeiraLocalizacao
  ) {
    state.primeiraLocalizacao =
      false;


    if (
      dentroDeSaoPaulo(
        state.lat,
        state.lon
      )
    ) {
      map.setView(
        [
          state.lat,
          state.lon
        ],

        CONFIG.zoomUsuario,

        {
          animate:
            false
        }
      );
    }

    else {
      map.setView(
        CENTRO_SP,
        13,
        {
          animate:
            false
        }
      );
    }
  }


  if (
    !state.modoNavegacao
  ) {
    criarPontosPerto();
  }
}


function obterLocalizacaoPromise() {
  return new Promise(
    resolve => {

      if (
        !navigator.geolocation
      ) {
        resolve(
          false
        );


        return;
      }


      navigator.geolocation
        .getCurrentPosition(
          posicao => {

            atualizarLocalizacao(
              posicao.coords.latitude,
              posicao.coords.longitude
            );


            resolve(
              true
            );

          },

          () => {

            resolve(
              false
            );

          },

          {
            enableHighAccuracy:
              false,

            timeout:
              12000,

            maximumAge:
              30_000
          }
        );

    }
  );
}


function obterLocalizacaoReal() {
  obterLocalizacaoPromise()
    .then(
      ok => {

        if (
          !ok
          &&
          state.primeiraLocalizacao
        ) {
          map.setView(
            CENTRO_SP,
            13,
            {
              animate:
                false
            }
          );
        }

      }
    );
}


function centralizarUsuario() {
  if (
    Number.isFinite(
      state.lat
    )
    &&
    Number.isFinite(
      state.lon
    )
    &&
    dentroDeSaoPaulo(
      state.lat,
      state.lon
    )
  ) {
    map.setView(
      [
        state.lat,
        state.lon
      ],

      CONFIG.zoomUsuario,

      {
        animate:
          false
      }
    );


    return;
  }


  obterLocalizacaoReal();
}


/* =========================================================
   MENU
========================================================= */

function abrirMenu() {
  if (
    state.modoNavegacao
  ) {
    return;
  }


  $("menu-lateral")
    ?.classList
    .add(
      "aberto"
    );


  $("menu-fundo")
    ?.classList
    .remove(
      "oculto"
    );
}


function fecharMenu() {
  $("menu-lateral")
    ?.classList
    .remove(
      "aberto"
    );


  $("menu-fundo")
    ?.classList
    .add(
      "oculto"
    );
}


/* =========================================================
   LINHA PESQUISADA
========================================================= */

function mesmaLinhaPesquisa(
  linhaA,
  linhaB
) {
  if (
    !linhaA
    ||
    !linhaB
  ) {
    return false;
  }


  if (
    normalizarCodigoLinha(
      numeroLinha(
        linhaA
      )
    )
    !==
    normalizarCodigoLinha(
      numeroLinha(
        linhaB
      )
    )
  ) {
    return false;
  }


  const sentidoA =
    Number(
      linhaA?.sentido
    );


  const sentidoB =
    Number(
      linhaB?.sentido
    );


  if (
    Number.isFinite(
      sentidoA
    )
    &&
    Number.isFinite(
      sentidoB
    )
  ) {
    return (
      sentidoA ===
      sentidoB
    );
  }


  const destinoA =
    normBusca(
      sentidoLinha(
        linhaA
      )
    );


  const destinoB =
    normBusca(
      sentidoLinha(
        linhaB
      )
    );


  return (
    !destinoA
    ||
    !destinoB
    ||
    destinoA ===
    destinoB
    ||
    destinoA.includes(
      destinoB
    )
    ||
    destinoB.includes(
      destinoA
    )
  );
}


function ordenarLinhasComPesquisadaPrimeiro(
  linhas
) {
  const pesquisada =
    state.linhaPesquisaSelecionada;


  return [
    ...arr(
      linhas
    )
  ]

    .sort(
      (
        a,
        b
      ) => {

        const aPesquisada =
          mesmaLinhaPesquisa(
            a,
            pesquisada
          );


        const bPesquisada =
          mesmaLinhaPesquisa(
            b,
            pesquisada
          );


        if (
          aPesquisada
          &&
          !bPesquisada
        ) {
          return -1;
        }


        if (
          !aPesquisada
          &&
          bPesquisada
        ) {
          return 1;
        }


        return numeroLinha(
          a
        )
          .localeCompare(
            numeroLinha(
              b
            ),
            "pt-BR"
          );

      }
    );
}


/* =========================================================
   GARANTIR PONTO NO MAPA
========================================================= */

function garantirPontoNoMapa(
  ponto
) {
  if (
    !ponto
  ) {
    return;
  }


  const id =
    idPonto(
      ponto
    );


  if (
    state.pontos.some(
      atual =>
        idPonto(
          atual
        ) ===
        id
    )
  ) {
    return;
  }


  state.pontos.unshift({
    ...ponto,

    distanciaCalculada:
      Number.isFinite(
        state.lat
      )
      &&
      Number.isFinite(
        state.lon
      )

        ? distanciaMetros(
            state.lat,
            state.lon,
            Number(
              ponto.py
            ),
            Number(
              ponto.px
            )
          )

        : Infinity
  });
}


/* =========================================================
   PAINEL DO PONTO
========================================================= */

function fecharPainelPonto() {
  clearInterval(
    state.timerPonto
  );


  state.timerPonto =
    null;


  state.ponto =
    null;


  state.pontoId =
    null;


  state.pontoSelecionadoId =
    null;


  state.linhaPesquisaSelecionada =
    null;


  $("painel-ponto")
    ?.classList
    .add(
      "oculto"
    );


  renderizarPontosMapa();
}


async function abrirPonto(
  ponto,
  linhaDestaque = null
) {
  if (
    state.modoNavegacao
    ||
    !ponto
  ) {
    return;
  }


  clearInterval(
    state.timerPonto
  );


  fecharMenu();


  if (
    linhaDestaque
  ) {
    state.linhaPesquisaSelecionada =
      linhaDestaque;
  }


  state.ponto =
    ponto;


  state.pontoId =
    codigoPonto(
      ponto
    );


  state.pontoSelecionadoId =
    idPonto(
      ponto
    );


  garantirPontoNoMapa(
    ponto
  );


  renderizarPontosMapa();


  if (
    $("painel-nome-ponto")
  ) {
    $("painel-nome-ponto")
      .textContent =
      nomePonto(
        ponto
      );
  }


  if (
    $("painel-endereco-ponto")
  ) {
    $("painel-endereco-ponto")
      .textContent =
      enderecoPonto(
        ponto
      );
  }


  if (
    $("lista-linhas-ponto")
  ) {
    $("lista-linhas-ponto")
      .innerHTML = `

        <div class="carregando">

          Buscando linhas e horários...

        </div>

      `;
  }


  $("painel-ponto")
    ?.classList
    .remove(
      "oculto"
    );


  await buscarLinhasDoPonto(
    ponto
  );


  state.timerPonto =
    setInterval(
      () => {

        if (
          state.pontoId ===
          codigoPonto(
            ponto
          )
          &&
          !state.modoNavegacao
        ) {
          buscarLinhasDoPonto(
            ponto
          );
        }

      },

      CONFIG.atualizarPontoMs
    );
}


async function buscarLinhasDoPonto(
  ponto
) {
  const box =
    $("lista-linhas-ponto");


  if (
    !box
  ) {
    return;
  }


  try {
    const dados =
      await consultarLinhasParada(
        ponto,
        false
      );


    if (
      state.pontoId !==
      codigoPonto(
        ponto
      )
      ||
      state.modoNavegacao
    ) {
      return;
    }


    const linhas =
      ordenarLinhasComPesquisadaPrimeiro(
        dados?.linhas
      );


    box.innerHTML =
      dados?.horarioConsulta

        ? `
          <div class="painel-atualizado">

            Atualizado às
            ${esc(
              dados.horarioConsulta
            )}

          </div>
        `

        : "";


    if (
      !linhas.length
    ) {
      box.insertAdjacentHTML(
        "beforeend",

        `
          <div class="estado-vazio">

            Nenhuma linha encontrada neste ponto.

          </div>
        `
      );


      return;
    }


    const fragmento =
      document.createDocumentFragment();


    for (
      const linha
      of
      linhas
    ) {
      const card =
        criarCardLinha(
          linha,
          ponto
        );


      if (
        mesmaLinhaPesquisa(
          linha,
          state.linhaPesquisaSelecionada
        )
      ) {
        card.classList
          .add(
            "linha-pesquisa-destaque"
          );


        const aviso =
          document.createElement(
            "div"
          );


        aviso.className =
          "linha-pesquisa-aviso";


        aviso.textContent =
          "ÔNIBUS PESQUISADO";


        card.prepend(
          aviso
        );
      }


      fragmento.appendChild(
        card
      );
    }


    box.appendChild(
      fragmento
    );


    if (
      state.linhaPesquisaSelecionada
    ) {
      requestAnimationFrame(
        () => {

          box.scrollTop =
            0;

        }
      );
    }
  }

  catch (erro) {
    console.warn(
      "Não foi possível carregar as linhas deste ponto:",
      erro
    );


    box.innerHTML = `

      <div class="estado-vazio">

        Não foi possível carregar as linhas.

      </div>

    `;
  }
}


/* =========================================================
   CARD DAS LINHAS
========================================================= */

function criarCardLinha(
  linha,
  ponto
) {
  const lista =
    previsoes(
      linha
    );


  const numero =
    numeroLinha(
      linha
    );


  const sentido =
    sentidoLinha(
      linha
    );


  const card =
    document.createElement(
      "article"
    );


  card.className =
    "linha-onibus-card";


  const previsoesHTML =
    lista.length

      ? lista

        .map(
          previsao => {

            const [
              classe,
              status
            ] =
              estadoPrevisao(
                linha,
                previsao
              );


            const veiculo =
              prefixo(
                previsao
              );


            return `

              <div
                class="
                  previsao-item
                  ${classe}
                "
              >

                <div>

                  <strong>

                    🚌

                    ${
                      veiculo

                        ? `Veículo ${esc(veiculo)}`

                        : "Veículo não informado"
                    }

                  </strong>


                  <div>

                    Linha ${esc(numero)}

                  </div>


                  <div>

                    Sentido →
                    ${esc(sentido)}

                  </div>


                  <small>

                    ${
                      previsao.horario

                        ? `${esc(previsao.horario)} · `

                        : ""
                    }

                    ${esc(status)}

                  </small>

                </div>


                <strong>

                  ${
                    previsao.minutos ===
                    0

                      ? "Agora"

                      : `${previsao.minutos} min`
                  }

                </strong>

              </div>

            `;

          }
        )

        .join("")

      : `

        <div class="sem-previsao">

          Sem previsão nos próximos
          ${CONFIG.limitePrevisaoMin}
          minutos.

        </div>

      `;


  card.innerHTML = `

    <div class="linha-cabecalho">

      <div>

        <small>
          LINHA
        </small>


        <div class="linha-numero">

          ${esc(numero)}

        </div>


        <div class="linha-sentido-box">

          <small>
            SENTIDO
          </small>


          <strong>

            → ${esc(sentido)}

          </strong>

        </div>

      </div>


      <div>

        ${lista.length}
        ônibus

      </div>

    </div>


    <div class="lista-previsoes">

      ${previsoesHTML}

    </div>


    <div class="acoes-linha">

      <button
        class="botao-ir-ponto"
        type="button"
      >

        🧭 Ir até este ponto

      </button>


      <button
        class="botao-reviews"
        type="button"
      >

        Avaliações

      </button>


      <button
        class="botao-avaliar"
        type="button"
      >

        Avaliar

      </button>


      <button
        class="botao-flash-linha"
        type="button"
      >

        ⚡ Flash

      </button>

    </div>

  `;


  card.querySelector(
    ".botao-ir-ponto"
  ).onclick =
    () =>
      iniciarNavegacaoAtePonto(
        ponto,
        linha
      );


  card.querySelector(
    ".botao-reviews"
  ).onclick =
    () =>
      abrirModalReviews(
        linha,
        ponto
      );


  card.querySelector(
    ".botao-avaliar"
  ).onclick =
    () =>
      abrirModalAvaliacao(
        linha,
        ponto
      );


  card.querySelector(
    ".botao-flash-linha"
  ).onclick =
    () =>
      abrirAvaliacoesFlash(
        linha,
        ponto
      );


  return card;
}


/* =========================================================
   NORMALIZAR PONTOS
========================================================= */

function normalizarPontoResultado(
  ponto
) {
  if (
    !ponto
  ) {
    return null;
  }


  const lat =
    Number(
      ponto.py
      ??
      ponto.lat
      ??
      ponto.latitude
    );


  const lon =
    Number(
      ponto.px
      ??
      ponto.lon
      ??
      ponto.lng
      ??
      ponto.longitude
    );


  if (
    !Number.isFinite(
      lat
    )
    ||
    !Number.isFinite(
      lon
    )
  ) {
    return null;
  }


  return {
    ...ponto,

    py:
      lat,

    px:
      lon
  };
}


function extrairPontosResultadoLinha(
  item
) {
  const candidatos =
    [];


  if (
    item?.ponto
  ) {
    candidatos.push(
      item.ponto
    );
  }


  if (
    item?.parada
  ) {
    candidatos.push(
      item.parada
    );
  }


  if (
    Array.isArray(
      item?.pontos
    )
  ) {
    candidatos.push(
      ...item.pontos
    );
  }


  if (
    Array.isArray(
      item?.paradas
    )
  ) {
    candidatos.push(
      ...item.paradas
    );
  }


  const vistos =
    new Set();


  const resultado =
    [];


  for (
    const candidato
    of
    candidatos
  ) {
    const ponto =
      normalizarPontoResultado(
        candidato
      );


    if (
      !ponto
    ) {
      continue;
    }


    const chave =
      codigoPonto(
        ponto
      )

      ||

      `${ponto.py.toFixed(6)}|${ponto.px.toFixed(6)}`;


    if (
      vistos.has(
        chave
      )
    ) {
      continue;
    }


    vistos.add(
      chave
    );


    resultado.push(
      ponto
    );
  }


  return resultado;
}


function distanciaPontoDoUsuario(
  ponto,
  distanciaServidor = Infinity
) {
  const lat =
    Number(
      ponto?.py
    );


  const lon =
    Number(
      ponto?.px
    );


  if (
    Number.isFinite(
      state.lat
    )
    &&
    Number.isFinite(
      state.lon
    )
    &&
    Number.isFinite(
      lat
    )
    &&
    Number.isFinite(
      lon
    )
  ) {
    return distanciaMetros(
      state.lat,
      state.lon,
      lat,
      lon
    );
  }


  const distancia =
    Number(
      distanciaServidor
    );


  return Number.isFinite(
    distancia
  )

    ? distancia

    : Infinity;
}


/* =========================================================
   PONTO MAIS PRÓXIMO DA LINHA
========================================================= */

function selecionarPontosMaisProximosDasLinhas(
  dados
) {
  const melhores =
    new Map();


  for (
    const item
    of
    arr(
      dados
    )
  ) {
    const linha =
      item?.linha
      ||
      item;


    if (
      !linha
    ) {
      continue;
    }


    const chave =
      chaveLinha(
        linha
      );


    const pontos =
      extrairPontosResultadoLinha(
        item
      );


    for (
      const ponto
      of
      pontos
    ) {
      const distancia =
        distanciaPontoDoUsuario(
          ponto,

          item?.distanciaEmbarque
          ??
          item?.distancia
        );


      const atual =
        melhores.get(
          chave
        );


      if (
        !atual
        ||
        distancia <
        atual.distanciaEmbarque
      ) {
        melhores.set(
          chave,
          {
            tipo:
              "linha",

            linha,

            ponto,

            distanciaEmbarque:
              distancia,

            score:
              Number(
                item?.score
                ??
                0
              )
          }
        );
      }
    }


    if (
      !pontos.length
      &&
      !melhores.has(
        chave
      )
    ) {
      melhores.set(
        chave,
        {
          tipo:
            "linha",

          linha,

          ponto:
            null,

          distanciaEmbarque:
            Infinity,

          score:
            Number(
              item?.score
              ??
              0
            )
        }
      );
    }
  }


  return [
    ...melhores.values()
  ]

    .sort(
      (
        a,
        b
      ) => {

        const scoreA =
          Number.isFinite(
            a.score
          )

            ? a.score

            : 0;


        const scoreB =
          Number.isFinite(
            b.score
          )

            ? b.score

            : 0;


        if (
          Math.abs(
            scoreB -
            scoreA
          )
          >
          0.001
        ) {
          return (
            scoreB -
            scoreA
          );
        }


        return (
          a.distanciaEmbarque
          -
          b.distanciaEmbarque
        );

      }
    );
}


/* =========================================================
   MOSTRAR PONTO DA PESQUISA
========================================================= */

function mostrarPontoPesquisaAutomaticamente(
  resultado
) {
  if (
    !resultado?.ponto
    ||
    !resultado?.linha
    ||
    state.modoNavegacao
  ) {
    return;
  }


  const ponto =
    resultado.ponto;


  const linha =
    resultado.linha;


  const lat =
    Number(
      ponto.py
    );


  const lon =
    Number(
      ponto.px
    );


  if (
    !Number.isFinite(
      lat
    )
    ||
    !Number.isFinite(
      lon
    )
  ) {
    return;
  }


  const chave =
    `${chaveLinha(linha)}|${idPonto(ponto)}`;


  if (
    state.ultimaLinhaAutoDestacada ===
    chave
  ) {
    return;
  }


  state.ultimaLinhaAutoDestacada =
    chave;


  state.linhaPesquisaSelecionada =
    linha;


  state.pontoSelecionadoId =
    idPonto(
      ponto
    );


  garantirPontoNoMapa(
    ponto
  );


  map.setView(
    [
      lat,
      lon
    ],

    17,

    {
      animate:
        false
    }
  );


  renderizarPontosMapa();
}


/* =========================================================
   PESQUISA
========================================================= */

function chaveCachePesquisa(
  tipo,
  termo
) {
  const lat =
    Number.isFinite(
      state.lat
    )

      ? state.lat
        .toFixed(
          3
        )

      : "x";


  const lon =
    Number.isFinite(
      state.lon
    )

      ? state.lon
        .toFixed(
          3
        )

      : "x";


  return (
    `${tipo}:${normBusca(termo)}:${lat}:${lon}`
  );
}


async function buscarLinhasCidadeInteira(
  termo,
  signal
) {
  const chave =
    chaveCachePesquisa(
      "linhas-sp",
      termo
    );


  const cached =
    cacheGet(
      cacheBusca,
      chave,
      CONFIG.cacheBuscaMs
    );


  if (
    cached
  ) {
    return cached;
  }


  const params =
    new URLSearchParams({
      termo
    });


  if (
    Number.isFinite(
      state.lat
    )
  ) {
    params.set(
      "lat",
      String(
        state.lat
      )
    );
  }


  if (
    Number.isFinite(
      state.lon
    )
  ) {
    params.set(
      "lon",
      String(
        state.lon
      )
    );
  }


  const dadosBrutos =
    await api(
      `/api/busca-linhas?${params}`,
      {
        signal
      }
    );


  const dados =
    extrairLista(
      dadosBrutos,
      "linhas",
      "resultados",
      "results"
    );


  return cacheSet(
    cacheBusca,
    chave,
    selecionarPontosMaisProximosDasLinhas(
      dados
    )
  );
}


async function buscarPontosCidadeInteira(
  termo,
  signal
) {
  const chave =
    chaveCachePesquisa(
      "pontos-sp",
      termo
    );


  const cached =
    cacheGet(
      cacheBusca,
      chave,
      CONFIG.cacheBuscaMs
    );


  if (
    cached
  ) {
    return cached;
  }


  const params =
    new URLSearchParams({
      termo
    });


  if (
    Number.isFinite(
      state.lat
    )
  ) {
    params.set(
      "lat",
      String(
        state.lat
      )
    );
  }


  if (
    Number.isFinite(
      state.lon
    )
  ) {
    params.set(
      "lon",
      String(
        state.lon
      )
    );
  }


  try {
    const dadosBrutos =
      await api(
        `/api/busca-pontos?${params}`,
        {
          signal
        }
      );


    const dados =
      extrairLista(
        dadosBrutos,
        "pontos",
        "paradas",
        "resultados",
        "results"
      );


    const resultado =
      dados

        .map(
          item => {

            const ponto =
              normalizarPontoResultado(
                item?.ponto
                ||
                item
              );


            if (
              !ponto
            ) {
              return null;
            }


            return {
              tipo:
                "ponto",

              ponto,

              score:
                Number(
                  item?.score
                  ??
                  0
                ),

              distancia:
                distanciaPontoDoUsuario(
                  ponto,
                  item?.distancia
                )
            };

          }
        )

        .filter(
          Boolean
        )

        .sort(
          (
            a,
            b
          ) =>
            a.distancia -
            b.distancia
        );


    return cacheSet(
      cacheBusca,
      chave,
      resultado
    );
  }

  catch (erro) {
    if (
      isAbort(
        erro
      )
    ) {
      throw erro;
    }


    return [];
  }
}


/* =========================================================
   BUSCA DE LOCAIS
========================================================= */

function converterPhoton(
  feature
) {
  const props =
    feature?.properties
    ||
    {};


  const coords =
    feature?.geometry?.coordinates
    ||
    [];


  const lon =
    Number(
      coords[0]
    );


  const lat =
    Number(
      coords[1]
    );


  if (
    !Number.isFinite(
      lat
    )
    ||
    !Number.isFinite(
      lon
    )
    ||
    !dentroDeSaoPaulo(
      lat,
      lon
    )
  ) {
    return null;
  }


  return {
    tipo:
      "local",

    lat,

    lon,

    nome:
      props.name
      ||
      props.street
      ||
      props.city
      ||
      "Local",

    endereco:
      [
        props.street,
        props.district,
        props.city,
        props.state
      ]

        .filter(
          Boolean
        )

        .join(
          ", "
        )
  };
}


async function buscarLocais(
  termo,
  signal
) {
  const chave =
    `local-sp:${normBusca(termo)}`;


  const cached =
    cacheGet(
      cacheLocais,
      chave,
      CONFIG.cacheLocalMs
    );


  if (
    cached
  ) {
    return cached;
  }


  const params =
    new URLSearchParams({
      q:
        termo,

      lang:
        "pt",

      bbox:
        "-46.83,-24.03,-46.36,-23.35"
    });


  if (
    Number.isFinite(
      state.lat
    )
    &&
    Number.isFinite(
      state.lon
    )
  ) {
    params.set(
      "lat",
      String(
        state.lat
      )
    );


    params.set(
      "lon",
      String(
        state.lon
      )
    );
  }


  let locais =
    [];


  try {
    const dados =
      await api(
        `https://photon.komoot.io/api/?${params}`,
        {
          signal
        }
      );


    locais =
      arr(
        dados?.features
      )

        .map(
          converterPhoton
        )

        .filter(
          Boolean
        );
  }

  catch (erro) {
    if (
      isAbort(
        erro
      )
    ) {
      throw erro;
    }
  }


  locais =
    locais

      .map(
        local => ({
          ...local,

          distancia:
            Number.isFinite(
              state.lat
            )
            &&
            Number.isFinite(
              state.lon
            )

              ? distanciaMetros(
                  state.lat,
                  state.lon,
                  local.lat,
                  local.lon
                )

              : Infinity
        })
      )

      .sort(
        (
          a,
          b
        ) =>
          a.distancia -
          b.distancia
      );


  return cacheSet(
    cacheLocais,
    chave,
    locais
  );
}


/* =========================================================
   ROTAS PARA DESTINO
========================================================= */

async function buscarRotasBackendDestino(
  local,
  signal
) {
  if (
    !Number.isFinite(
      state.lat
    )
    ||
    !Number.isFinite(
      state.lon
    )
  ) {
    return [];
  }


  const params =
    new URLSearchParams({
      origemLat:
        String(
          state.lat
        ),

      origemLon:
        String(
          state.lon
        ),

      destinoLat:
        String(
          local.lat
        ),

      destinoLon:
        String(
          local.lon
        ),

      raioDestinoM:
        String(
          CONFIG.raioDestinoM
        )
    });


  try {
    const bruto =
      await api(
        `/api/busca-rotas?${params}`,
        {
          signal
        }
      );


    return extrairLista(
      bruto,
      "rotas",
      "resultados",
      "results"
    )

      .map(
        item => ({
          tipo:
            "destino",

          linha:
            item.linha,

          ponto:
            normalizarPontoResultado(
              item.ponto
            ),

          pontoDestino:
            normalizarPontoResultado(
              item.pontoDestino
            ),

          destinoBusca:
            local,

          distanciaEmbarque:
            Number(
              item.distanciaEmbarque
              ??
              Infinity
            ),

          distanciaDestino:
            Number(
              item.distanciaDestino
              ??
              Infinity
            ),

          score:
            Number(
              item.score
              ??
              0
            ),

          previsoes:
            arr(
              item.linha
                ?.previsoes
            )
        })
      );
  }

  catch (erro) {
    if (
      isAbort(
        erro
      )
    ) {
      throw erro;
    }


    return [];
  }
}


/* =========================================================
   CAMPO DE PESQUISA
========================================================= */

function configurarBuscaOnibus() {
  const campo =
    $("campoBuscaOnibus");


  if (
    !campo
  ) {
    return;
  }


  campo.addEventListener(
    "input",
    () => {

      clearTimeout(
        state.buscaTimer
      );


      const termo =
        campo.value
          .trim();


      $("botaoLimparBusca")
        ?.classList
        .toggle(
          "oculto",
          !termo
        );


      if (
        termo.length <
        2
      ) {
        state.buscaSeq++;


        state.buscaAbort
          ?.abort();


        state.ultimaLinhaAutoDestacada =
          null;


        state.linhaPesquisaSelecionada =
          null;


        esconderResultadosBusca();


        return;
      }


      state.buscaTimer =
        setTimeout(
          () =>
            pesquisarOnibus(
              termo
            ),

          CONFIG.debounceBuscaMs
        );

    }
  );


  campo.addEventListener(
    "keydown",
    evento => {

      if (
        evento.key ===
        "Escape"
      ) {
        limparBuscaOnibus();


        return;
      }


      if (
        evento.key ===
        "Enter"
      ) {
        evento.preventDefault();


        clearTimeout(
          state.buscaTimer
        );


        pesquisarOnibus(
          campo.value
            .trim()
        );
      }

    }
  );
}


function mostrarStatusBusca(
  texto
) {
  const box =
    $("resultadosBuscaOnibus");


  if (
    !box
  ) {
    return;
  }


  box.classList
    .remove(
      "oculto"
    );


  box.innerHTML = `

    <div class="busca-status">

      ${esc(texto)}

    </div>

  `;
}


/* =========================================================
   PESQUISAR
========================================================= */

async function pesquisarOnibus(
  termoOriginal
) {
  if (
    !termoOriginal
    ||
    termoOriginal.length <
    2
    ||
    state.modoNavegacao
  ) {
    return;
  }


  state.ultimaLinhaAutoDestacada =
    null;


  state.linhaPesquisaSelecionada =
    null;


  if (
    !Number.isFinite(
      state.lat
    )
    ||
    !Number.isFinite(
      state.lon
    )
  ) {
    mostrarStatusBusca(
      "Localizando você para encontrar o ponto mais próximo..."
    );


    await obterLocalizacaoPromise();
  }


  state.buscaAbort
    ?.abort();


  const controller =
    new AbortController();


  state.buscaAbort =
    controller;


  const signal =
    controller.signal;


  const sequencia =
    ++state.buscaSeq;


  mostrarStatusBusca(
    "Procurando..."
  );


  try {
    const linhas =
      await buscarLinhasCidadeInteira(
        termoOriginal,
        signal
      );


    if (
      sequencia !==
      state.buscaSeq
    ) {
      return;
    }


    const automatico =
      linhas.find(
        resultado =>
          resultado.ponto
          &&
          Number.isFinite(
            resultado.distanciaEmbarque
          )
      );


    if (
      automatico
    ) {
      mostrarPontoPesquisaAutomaticamente(
        automatico
      );
    }


    if (
      pareceCodigoLinha(
        termoOriginal
      )
    ) {
      renderizarResultadosBusca({
        linhas
      });


      return;
    }


    renderizarResultadosBusca({
      linhas,

      carregandoDestino:
        true
    });


    const [
      pontos,
      locais
    ] =
      await Promise.all([
        termoOriginal.length >=
        3

          ? buscarPontosCidadeInteira(
              termoOriginal,
              signal
            )

          : Promise.resolve(
              []
            ),

        termoOriginal.length >=
        3

          ? buscarLocais(
              termoOriginal,
              signal
            )

          : Promise.resolve(
              []
            )
      ]);


    if (
      sequencia !==
      state.buscaSeq
    ) {
      return;
    }


    const destinoProvavel =
      locais[0]
      ||
      null;


    const rotas =
      destinoProvavel

        ? await buscarRotasBackendDestino(
            destinoProvavel,
            signal
          )

        : [];


    if (
      sequencia !==
      state.buscaSeq
    ) {
      return;
    }


    renderizarResultadosBusca({
      linhas,
      pontos,
      locais,
      destinoProvavel,
      rotas
    });
  }

  catch (erro) {
    if (
      isAbort(
        erro
      )
    ) {
      return;
    }


    console.warn(
      "Pesquisa indisponível:",
      erro
    );


    if (
      sequencia ===
      state.buscaSeq
    ) {
      mostrarStatusBusca(
        "Não foi possível pesquisar agora."
      );
    }
  }
}


/* =========================================================
   RESULTADOS
========================================================= */

function tituloBusca(
  texto
) {
  const div =
    document.createElement(
      "div"
    );


  div.className =
    "resultado-busca-secao";


  div.textContent =
    texto;


  return div;
}


function appendSecaoVirtual(
  box,
  titulo,
  itens,
  builder
) {
  if (
    !itens.length
  ) {
    return;
  }


  box.appendChild(
    tituloBusca(
      titulo
    )
  );


  const lista =
    document.createElement(
      "div"
    );


  const sentinel =
    document.createElement(
      "div"
    );


  sentinel.className =
    "busca-sentinel";


  box.append(
    lista,
    sentinel
  );


  let indice =
    0;


  let observer =
    null;


  const carregar =
    () => {

      const fragmento =
        document.createDocumentFragment();


      const fim =
        Math.min(
          indice +
          18,

          itens.length
        );


      while (
        indice <
        fim
      ) {
        fragmento.appendChild(
          builder(
            itens[
              indice++
            ]
          )
        );
      }


      lista.appendChild(
        fragmento
      );


      if (
        indice >=
        itens.length
      ) {
        observer
          ?.disconnect();


        sentinel.remove();
      }

    };


  carregar();


  if (
    indice <
    itens.length
    &&
    "IntersectionObserver"
    in
    window
  ) {
    observer =
      new IntersectionObserver(
        entradas => {

          if (
            entradas.some(
              entrada =>
                entrada.isIntersecting
            )
          ) {
            carregar();
          }

        },

        {
          root:
            null,

          rootMargin:
            "250px"
        }
      );


    observer.observe(
      sentinel
    );
  }
}


function renderizarResultadosBusca({
  linhas = [],
  pontos = [],
  locais = [],
  destinoProvavel = null,
  rotas = [],
  carregandoDestino = false
}) {
  const box =
    $("resultadosBuscaOnibus");


  if (
    !box
    ||
    state.modoNavegacao
  ) {
    return;
  }


  box.classList
    .remove(
      "oculto"
    );


  box.innerHTML =
    "";


  if (
    destinoProvavel
  ) {
    const aviso =
      document.createElement(
        "div"
      );


    aviso.className =
      "busca-entendida";


    aviso.innerHTML = `

      <small>

        DESTINO PROVÁVEL

      </small>


      <strong>

        📍
        ${esc(
          destinoProvavel.nome
        )}

      </strong>


      ${
        destinoProvavel.endereco

          ? `
            <span>

              ${esc(
                destinoProvavel.endereco
              )}

            </span>
          `

          : ""
      }

    `;


    box.appendChild(
      aviso
    );
  }


  appendSecaoVirtual(
    box,
    "LINHAS — PONTO MAIS PRÓXIMO DE VOCÊ",
    linhas,
    resultadoLinhaBusca
  );


  appendSecaoVirtual(
    box,
    "ROTAS PARA O DESTINO",
    rotas,
    resultadoLinhaBusca
  );


  appendSecaoVirtual(
    box,
    "PONTOS",
    pontos,
    resultadoPontoBusca
  );


  appendSecaoVirtual(
    box,
    "LOCAIS EM SÃO PAULO",
    locais,
    resultadoLocalBusca
  );


  if (
    carregandoDestino
  ) {
    const status =
      document.createElement(
        "div"
      );


    status.className =
      "busca-status busca-status-secundario";


    status.textContent =
      "Verificando outros resultados...";


    box.appendChild(
      status
    );
  }


  if (
    !linhas.length
    &&
    !pontos.length
    &&
    !locais.length
    &&
    !rotas.length
    &&
    !carregandoDestino
  ) {
    box.innerHTML = `

      <div class="busca-status">

        Nenhum resultado encontrado.

      </div>

    `;
  }
}


function resultadoLinhaBusca(
  resultado
) {
  const item =
    document.createElement(
      "button"
    );


  item.type =
    "button";


  item.className =
    "resultado-busca-item";


  const ponto =
    resultado.ponto;


  item.innerHTML = `

    <span class="resultado-linha-numero">

      🚌
      ${esc(
        numeroLinha(
          resultado.linha
        )
      )}

    </span>


    <strong>

      Sentido →

      ${esc(
        sentidoLinha(
          resultado.linha
        )
      )}

    </strong>


    ${
      ponto

        ? `
          <div class="resultado-ponto-mais-proximo">

            <small>

              PONTO MAIS PRÓXIMO ONDE ESTA LINHA PASSA

            </small>


            <strong>

              🚏
              ${esc(
                nomePonto(
                  ponto
                )
              )}

            </strong>


            ${
              enderecoPonto(
                ponto
              )

                ? `
                  <span>

                    ${esc(
                      enderecoPonto(
                        ponto
                      )
                    )}

                  </span>
                `

                : ""
            }

          </div>
        `

        : `
          <div class="resultado-sem-ponto">

            Ponto mais próximo indisponível.

          </div>
        `
    }


    ${
      Number.isFinite(
        resultado.distanciaEmbarque
      )

        ? `
          <small class="resultado-distancia-ponto">

            📍
            ${formatarDistancia(
              resultado.distanciaEmbarque
            )}

            de você

          </small>
        `

        : ""
    }

  `;


  item.onclick =
    () =>
      selecionarResultadoBusca(
        resultado
      );


  return item;
}


function resultadoPontoBusca(
  resultado
) {
  const ponto =
    resultado.ponto;


  const item =
    document.createElement(
      "button"
    );


  item.type =
    "button";


  item.className =
    "resultado-busca-item";


  item.innerHTML = `

    <strong>

      🚏
      ${esc(
        nomePonto(
          ponto
        )
      )}

    </strong>


    ${
      enderecoPonto(
        ponto
      )

        ? `
          <span>

            ${esc(
              enderecoPonto(
                ponto
              )
            )}

          </span>
        `

        : ""
    }


    ${
      Number.isFinite(
        resultado.distancia
      )

        ? `
          <small>

            📍
            ${formatarDistancia(
              resultado.distancia
            )}

            de você

          </small>
        `

        : ""
    }

  `;


  item.onclick =
    () => {

      esconderResultadosBusca();


      state.linhaPesquisaSelecionada =
        null;


      abrirPontoDaPesquisa(
        ponto
      );

    };


  return item;
}


function resultadoLocalBusca(
  local
) {
  const item =
    document.createElement(
      "button"
    );


  item.type =
    "button";


  item.className =
    "resultado-busca-item";


  item.innerHTML = `

    <strong>

      📍
      ${esc(
        local.nome
      )}

    </strong>


    ${
      local.endereco

        ? `
          <span>

            ${esc(
              local.endereco
            )}

          </span>
        `

        : ""
    }


    ${
      Number.isFinite(
        local.distancia
      )

        ? `
          <small>

            ${formatarDistancia(
              local.distancia
            )}

            de você

          </small>
        `

        : ""
    }

  `;


  item.onclick =
    () =>
      selecionarLocalBusca(
        local
      );


  return item;
}


/* =========================================================
   SELECIONAR RESULTADO
========================================================= */

function abrirPontoDaPesquisa(
  ponto,
  linha = null
) {
  if (
    !ponto
  ) {
    return;
  }


  const lat =
    Number(
      ponto.py
    );


  const lon =
    Number(
      ponto.px
    );


  if (
    !Number.isFinite(
      lat
    )
    ||
    !Number.isFinite(
      lon
    )
  ) {
    return;
  }


  if (
    linha
  ) {
    state.linhaPesquisaSelecionada =
      linha;
  }


  state.pontoSelecionadoId =
    idPonto(
      ponto
    );


  garantirPontoNoMapa(
    ponto
  );


  map.setView(
    [
      lat,
      lon
    ],

    17.5,

    {
      animate:
        false
    }
  );


  renderizarPontosMapa();


  abrirPonto(
    ponto,
    linha
  );
}


function selecionarResultadoBusca(
  resultado
) {
  if (
    !resultado?.ponto
  ) {
    return;
  }


  state.linhaPesquisaSelecionada =
    resultado.linha
    ||
    null;


  esconderResultadosBusca();


  abrirPontoDaPesquisa(
    resultado.ponto,
    resultado.linha
  );
}


async function selecionarLocalBusca(
  local
) {
  state.buscaAbort
    ?.abort();


  const controller =
    new AbortController();


  state.buscaAbort =
    controller;


  const sequencia =
    ++state.buscaSeq;


  mostrarStatusBusca(
    `Procurando ônibus para ${local.nome}...`
  );


  try {
    const rotas =
      await buscarRotasBackendDestino(
        local,
        controller.signal
      );


    if (
      sequencia !==
      state.buscaSeq
    ) {
      return;
    }


    renderizarResultadosBusca({
      locais:
        [
          local
        ],

      destinoProvavel:
        local,

      rotas
    });
  }

  catch (erro) {
    if (
      !isAbort(
        erro
      )
    ) {
      mostrarStatusBusca(
        "Não foi possível montar a rota."
      );
    }
  }
}


function esconderResultadosBusca() {
  const box =
    $("resultadosBuscaOnibus");


  box
    ?.classList
    .add(
      "oculto"
    );


  if (
    box
  ) {
    box.innerHTML =
      "";
  }
}


function limparBuscaOnibus() {
  state.buscaSeq++;


  state.buscaAbort
    ?.abort();


  clearTimeout(
    state.buscaTimer
  );


  state.ultimaLinhaAutoDestacada =
    null;


  state.linhaPesquisaSelecionada =
    null;


  if (
    $("campoBuscaOnibus")
  ) {
    $("campoBuscaOnibus")
      .value =
      "";
  }


  $("botaoLimparBusca")
    ?.classList
    .add(
      "oculto"
    );


  esconderResultadosBusca();


  state.pontoSelecionadoId =
    null;


  renderizarPontosMapa();
}


/* =========================================================
   ROTA A PÉ
========================================================= */

async function obterRotaPedestrePelasRuas(
  origemLat,
  origemLon,
  destinoLat,
  destinoLon
) {
  return api(
    `/api/rota-pedestre` +
    `?origemLat=${encodeURIComponent(origemLat)}` +
    `&origemLon=${encodeURIComponent(origemLon)}` +
    `&destinoLat=${encodeURIComponent(destinoLat)}` +
    `&destinoLon=${encodeURIComponent(destinoLon)}`
  );
}


/* =========================================================
   NAVEGAÇÃO
========================================================= */

function garantirPainelNavegacao() {
  if (
    $("painelNavegacaoPonto")
  ) {
    return;
  }


  const painel =
    document.createElement(
      "section"
    );


  painel.id =
    "painelNavegacaoPonto";


  painel.className =
    "painel-navegacao-ponto oculto";


  painel.innerHTML = `

    <button
      id="fecharNavegacaoPonto"
      class="navegacao-fechar-vermelho"
      type="button"
      aria-label="Fechar navegação"
    >

      ×

    </button>

  `;


  document.body
    .appendChild(
      painel
    );


  $("fecharNavegacaoPonto")
    .onclick =
    () =>
      pararNavegacaoPonto();
}


function fecharTudoParaNavegacao() {
  state.modoNavegacao =
    true;


  document.body
    .classList
    .add(
      "busreview-modo-rota"
    );


  fecharMenu();


  clearInterval(
    state.timerPonto
  );


  state.timerPonto =
    null;


  clearTimeout(
    state.buscaTimer
  );


  state.buscaAbort
    ?.abort();


  [
    "painel-ponto",
    "resultadosBuscaOnibus",
    "painel-rota",
    "modalReviews",
    "modalAvaliacao",
    "modalFlash",
    "modalMinhasAvaliacoes",
    "modalLugar",
    "modalSP156",
    "modalLoginLocal",
    "modalFotoBusReview"
  ]

    .forEach(
      id =>
        $(id)
          ?.classList
          .add(
            "oculto"
          )
    );


  limparMarkersPontos();


  state.pontoSelecionadoId =
    null;


  if (
    state.userMarker
    &&
    map.hasLayer(
      state.userMarker
    )
  ) {
    map.removeLayer(
      state.userMarker
    );
  }
}


function restaurarMapaDepoisNavegacao() {
  state.modoNavegacao =
    false;


  document.body
    .classList
    .remove(
      "busreview-modo-rota"
    );


  if (
    state.userMarker
    &&
    !map.hasLayer(
      state.userMarker
    )
    &&
    dentroDeSaoPaulo(
      state.lat,
      state.lon
    )
  ) {
    state.userMarker
      .addTo(
        map
      );
  }


  renderizarPontosMapa();
}


function aplicarRotaNoMapa(
  rota,
  ajustar = true
) {
  if (
    state.navegacao.linhaMapa
    &&
    map.hasLayer(
      state.navegacao.linhaMapa
    )
  ) {
    map.removeLayer(
      state.navegacao.linhaMapa
    );
  }


  const coordenadas =
    arr(
      rota?.coordenadas
    );


  if (
    !coordenadas.length
  ) {
    throw new Error(
      "Rota sem coordenadas."
    );
  }


  state.navegacao.linhaMapa =
    L.polyline(
      coordenadas,
      {
        color:
          "#1687E8",

        weight:
          7,

        opacity:
          0.95,

        lineCap:
          "round",

        lineJoin:
          "round",

        interactive:
          false
      }
    )

      .addTo(
        map
      );


  if (
    ajustar
  ) {
    map.fitBounds(
      state.navegacao
        .linhaMapa
        .getBounds(),

      {
        padding:
          [
            45,
            45
          ],

        animate:
          false,

        maxZoom:
          18
      }
    );
  }
}


async function recalcularRotaNavegacao(
  lat,
  lon
) {
  const nav =
    state.navegacao;


  if (
    !state.modoNavegacao
    ||
    !nav.ponto
    ||
    nav.recalculando
    ||
    !Number.isFinite(
      nav.ultimaRotaLat
    )
  ) {
    return;
  }


  const movimento =
    distanciaMetros(
      nav.ultimaRotaLat,
      nav.ultimaRotaLon,
      lat,
      lon
    );


  if (
    movimento <
    CONFIG.recalcularRotaDepoisM
    ||
    Date.now()
    -
    nav.ultimaRotaEm
    <
    CONFIG.recalcularRotaDepoisMs
  ) {
    return;
  }


  nav.recalculando =
    true;


  try {
    const rota =
      await obterRotaPedestrePelasRuas(
        lat,
        lon,
        Number(
          nav.ponto.py
        ),
        Number(
          nav.ponto.px
        )
      );


    aplicarRotaNoMapa(
      rota,
      false
    );


    nav.ultimaRotaLat =
      lat;


    nav.ultimaRotaLon =
      lon;


    nav.ultimaRotaEm =
      Date.now();
  }

  catch {}

  finally {
    nav.recalculando =
      false;
  }
}


async function iniciarNavegacaoAtePonto(
  ponto,
  linha = null
) {
  if (
    !Number.isFinite(
      state.lat
    )
    ||
    !Number.isFinite(
      state.lon
    )
  ) {
    alert(
      "Aguardando sua localização."
    );


    return;
  }


  const destinoLat =
    Number(
      ponto?.py
    );


  const destinoLon =
    Number(
      ponto?.px
    );


  if (
    !Number.isFinite(
      destinoLat
    )
    ||
    !Number.isFinite(
      destinoLon
    )
  ) {
    return;
  }


  pararNavegacaoPonto(
    false
  );


  fecharTudoParaNavegacao();


  garantirPainelNavegacao();


  state.navegacao.ponto =
    ponto;


  state.navegacao.linhaOnibus =
    linha;


  state.navegacao.ultimaRotaLat =
    state.lat;


  state.navegacao.ultimaRotaLon =
    state.lon;


  state.navegacao.ultimaRotaEm =
    Date.now();


  state.navegacao.marcadorUsuario =
    L.circleMarker(
      [
        state.lat,
        state.lon
      ],
      {
        radius:
          9,

        color:
          "#fff",

        fillColor:
          "#1687E8",

        weight:
          4,

        fillOpacity:
          1,

        interactive:
          false
      }
    )

      .addTo(
        map
      );


  state.navegacao.marcadorPonto =
    L.circleMarker(
      [
        destinoLat,
        destinoLon
      ],
      {
        radius:
          10,

        color:
          "#fff",

        fillColor:
          "#1687E8",

        weight:
          4,

        fillOpacity:
          1,

        interactive:
          false
      }
    )

      .addTo(
        map
      );


  $("painelNavegacaoPonto")
    ?.classList
    .remove(
      "oculto"
    );


  try {
    const rota =
      await obterRotaPedestrePelasRuas(
        state.lat,
        state.lon,
        destinoLat,
        destinoLon
      );


    aplicarRotaNoMapa(
      rota,
      true
    );
  }

  catch {
    aplicarRotaNoMapa(
      {
        coordenadas: [
          [
            state.lat,
            state.lon
          ],

          [
            destinoLat,
            destinoLon
          ]
        ]
      },

      true
    );
  }


  state.navegacao.watchId =
    navigator.geolocation
      ?.watchPosition(
        posicao => {

          const lat =
            posicao.coords.latitude;


          const lon =
            posicao.coords.longitude;


          state.lat =
            lat;


          state.lon =
            lon;


          state.navegacao
            .marcadorUsuario
            ?.setLatLng(
              [
                lat,
                lon
              ]
            );


          if (
            distanciaMetros(
              lat,
              lon,
              destinoLat,
              destinoLon
            )
            >
            CONFIG.distanciaChegadaPontoM
          ) {
            recalcularRotaNavegacao(
              lat,
              lon
            );
          }

        },

        () => {},

        {
          enableHighAccuracy:
            true,

          maximumAge:
            5000,

          timeout:
            15000
        }
      )

    ??

    null;
}


function pararNavegacaoPonto(
  restaurar = true
) {
  if (
    state.navegacao.watchId !==
    null
  ) {
    navigator.geolocation
      ?.clearWatch(
        state.navegacao.watchId
      );
  }


  [
    state.navegacao.linhaMapa,
    state.navegacao.marcadorPonto,
    state.navegacao.marcadorUsuario
  ]

    .forEach(
      camada => {

        if (
          camada
          &&
          map.hasLayer(
            camada
          )
        ) {
          map.removeLayer(
            camada
          );
        }

      }
    );


  Object.assign(
    state.navegacao,
    {
      watchId:
        null,

      linhaMapa:
        null,

      marcadorPonto:
        null,

      marcadorUsuario:
        null,

      ponto:
        null,

      linhaOnibus:
        null,

      ultimaRotaLat:
        null,

      ultimaRotaLon:
        null,

      ultimaRotaEm:
        0,

      recalculando:
        false
    }
  );


  $("painelNavegacaoPonto")
    ?.classList
    .add(
      "oculto"
    );


  if (
    restaurar
  ) {
    restaurarMapaDepoisNavegacao();
  }
}


/* =========================================================
   FOTOS DAS AVALIAÇÕES
========================================================= */

function garantirAreaFotosAvaliacao() {
  const modal =
    $("modalAvaliacao");


  if (
    !modal
    ||
    $("areaFotosAvaliacao")
  ) {
    return;
  }


  const area =
    document.createElement(
      "section"
    );


  area.id =
    "areaFotosAvaliacao";


  area.className =
    "avaliacao-fotos-area";


  area.innerHTML = `

    <strong>

      📷 Fotos da avaliação

    </strong>


    <div class="avaliacao-fotos-acoes">

      <button
        id="fotoCameraAvaliacao"
        type="button"
      >

        📷 Tirar foto

      </button>


      <button
        id="fotoGaleriaAvaliacao"
        type="button"
      >

        🖼️ Galeria

      </button>

    </div>


    <small id="contadorFotosAvaliacao"></small>


    <div
      id="previewFotosAvaliacao"
      class="avaliacao-fotos-preview"
    ></div>

  `;


  (
    modal.querySelector(
      ".modal"
    )
    ||
    modal
  )
    .appendChild(
      area
    );


  $("fotoCameraAvaliacao")
    .onclick =
    () =>
      escolherFotosAvaliacao(
        true
      );


  $("fotoGaleriaAvaliacao")
    .onclick =
    () =>
      escolherFotosAvaliacao(
        false
      );
}


async function escolherFotosAvaliacao(
  camera
) {
  const files =
    await escolherArquivo({
      camera,

      multiple:
        !camera
    });


  for (
    const file
    of
    files
  ) {
    if (
      state.fotosAvaliacao.length >=
      CONFIG.maxFotos
    ) {
      break;
    }


    if (
      !file.type
        .startsWith(
          "image/"
        )
      ||
      file.size >
      CONFIG.maxFotoBytes
    ) {
      continue;
    }


    try {
      state.fotosAvaliacao.push({
        id:
          gerarId(),

        imagem:
          await imagemDataURL(
            file,
            720,
            0.68,
            false
          )
      });
    }

    catch {}
  }


  renderFotosAvaliacao();
}


function renderFotosAvaliacao() {
  if (
    $("contadorFotosAvaliacao")
  ) {
    $("contadorFotosAvaliacao")
      .textContent =
      `${state.fotosAvaliacao.length}/${CONFIG.maxFotos} fotos`;
  }


  const box =
    $("previewFotosAvaliacao");


  if (
    !box
  ) {
    return;
  }


  box.innerHTML =
    "";


  for (
    const foto
    of
    state.fotosAvaliacao
  ) {
    const item =
      document.createElement(
        "div"
      );


    item.className =
      "avaliacao-foto-preview";


    item.innerHTML = `

      <img
        src="${esc(foto.imagem)}"
        alt=""
      >


      <button
        type="button"
      >

        ×

      </button>

    `;


    item.querySelector(
      "button"
    ).onclick =
      () => {

        state.fotosAvaliacao =
          state.fotosAvaliacao

            .filter(
              atual =>
                atual.id !==
                foto.id
            );


        renderFotosAvaliacao();

      };


    box.appendChild(
      item
    );
  }
}


/* =========================================================
   AVALIAÇÕES
========================================================= */

function estrelas(
  nota
) {
  const valor =
    Math.max(
      0,

      Math.min(
        5,

        Math.round(
          Number(
            nota
          )
          ||
          0
        )
      )
    );


  return (
    "★".repeat(
      valor
    )

    +

    "☆".repeat(
      5 -
      valor
    )
  );
}


function reviewsDaLinha(
  linha
) {
  return arr(
    lerStorage(
      CONFIG.storage.avaliacoes,
      []
    )
  )

    .filter(
      review =>
        review.linha ===
        chaveLinha(
          linha
        )
    )

    .sort(
      (
        a,
        b
      ) =>
        new Date(
          b.criado_em
          ||
          0
        )
        -
        new Date(
          a.criado_em
          ||
          0
        )
    );
}


function abrirModalAvaliacao(
  linha,
  ponto
) {
  if (
    !exigirPerfilLocal()
    ||
    state.modoNavegacao
  ) {
    return;
  }


  state.linhaAvaliacao =
    linha;


  state.pontoAvaliacao =
    ponto;


  state.nota =
    0;


  state.fotosAvaliacao =
    [];


  garantirAreaFotosAvaliacao();


  renderFotosAvaliacao();


  if (
    $("tituloAvaliacao")
  ) {
    $("tituloAvaliacao")
      .textContent =
      `Avaliar ${numeroLinha(linha)}`;
  }


  if (
    $("subtituloAvaliacao")
  ) {
    $("subtituloAvaliacao")
      .textContent =
      `Sentido → ${sentidoLinha(linha)}`;
  }


  if (
    $("textoAvaliacao")
  ) {
    $("textoAvaliacao")
      .value =
      "";
  }


  if (
    $("lotacaoAvaliacao")
  ) {
    $("lotacaoAvaliacao")
      .value =
      "";
  }


  if (
    $("atrasoAvaliacao")
  ) {
    $("atrasoAvaliacao")
      .value =
      "";
  }


  const select =
    $("prefixoAvaliacao");


  if (
    select
  ) {
    select.innerHTML = `

      <option value="">

        Não informar o veículo

      </option>

    `;


    const veiculos =
      [
        ...new Set(
          arr(
            linha?.previsoes
          )

            .map(
              prefixo
            )

            .filter(
              Boolean
            )
        )
      ];


    for (
      const veiculo
      of
      veiculos
    ) {
      select.insertAdjacentHTML(
        "beforeend",

        `
          <option value="${esc(veiculo)}">

            Veículo ${esc(veiculo)}

          </option>
        `
      );
    }
  }


  $("modalAvaliacao")
    ?.classList
    .remove(
      "oculto"
    );


  atualizarEstrelas();
}


function fecharModalAvaliacao() {
  $("modalAvaliacao")
    ?.classList
    .add(
      "oculto"
    );
}


function definirNota(
  nota
) {
  state.nota =
    Number(
      nota
    );


  atualizarEstrelas();
}


function atualizarEstrelas() {
  document
    .querySelectorAll(
      "#estrelasAvaliacao button"
    )

    .forEach(
      (
        botao,
        indice
      ) => {

        botao.classList
          .toggle(
            "ativa",
            indice <
            state.nota
          );

      }
    );
}


function enviarAvaliacao() {
  if (
    !exigirPerfilLocal()
  ) {
    return;
  }


  if (
    !state.linhaAvaliacao
    ||
    state.nota <
    1
  ) {
    alert(
      "Escolha uma nota."
    );


    return;
  }


  const reviews =
    arr(
      lerStorage(
        CONFIG.storage.avaliacoes,
        []
      )
    );


  reviews.unshift({
    id:
      gerarId(),

    autorId:
      state.usuario.id,

    autorNome:
      state.usuario.nome,

    autorFoto:
      state.usuario.foto
      ||
      "",

    linha:
      chaveLinha(
        state.linhaAvaliacao
      ),

    numero:
      numeroLinha(
        state.linhaAvaliacao
      ),

    destino:
      destino(
        state.linhaAvaliacao
      ),

    pontoId:
      codigoPonto(
        state.pontoAvaliacao
      ),

    ponto:
      nomePonto(
        state.pontoAvaliacao
      ),

    prefixo:
      $("prefixoAvaliacao")
        ?.value
      ||
      "",

    nota:
      state.nota,

    comentario:
      $("textoAvaliacao")
        ?.value
        .trim()
      ||
      "",

    lotacao:
      $("lotacaoAvaliacao")
        ?.value
      ||
      "",

    atraso:
      $("atrasoAvaliacao")
        ?.value
      ||
      "",

    fotos:
      state.fotosAvaliacao

        .map(
          item =>
            item.imagem
        ),

    criado_em:
      new Date()
        .toISOString()
  });


  if (
    !salvarStorage(
      CONFIG.storage.avaliacoes,
      reviews
    )
  ) {
    alert(
      "O navegador ficou sem espaço para salvar a avaliação. Tente remover algumas fotos."
    );


    return;
  }


  fecharModalAvaliacao();


  alert(
    "Avaliação publicada no BusReview."
  );
}


function ampliarFoto(
  src
) {
  if (
    state.modoNavegacao
    ||
    !src
  ) {
    return;
  }


  let modal =
    $("modalFotoBusReview");


  if (
    !modal
  ) {
    modal =
      document.createElement(
        "div"
      );


    modal.id =
      "modalFotoBusReview";


    modal.className =
      "foto-modal oculto";


    modal.innerHTML = `

      <button
        type="button"
        aria-label="Fechar"
      >

        ×

      </button>


      <img
        alt="Foto da avaliação"
      >

    `;


    document.body
      .appendChild(
        modal
      );


    modal.querySelector(
      "button"
    ).onclick =
      () =>
        modal.classList
          .add(
            "oculto"
          );


    modal.onclick =
      evento => {

        if (
          evento.target ===
          modal
        ) {
          modal.classList
            .add(
              "oculto"
            );
        }

      };
  }


  modal.querySelector(
    "img"
  ).src =
    src;


  modal.classList
    .remove(
      "oculto"
    );
}


function criarReview(
  review,
  mostrarLinha = false
) {
  const item =
    document.createElement(
      "article"
    );


  item.className =
    "review-item";


  const fotos =
    arr(
      review.fotos
    );


  item.innerHTML = `

    <div class="review-autor">

      ${
        review.autorFoto

          ? `
            <img
              src="${esc(review.autorFoto)}"
              alt=""
            >
          `

          : `
            <span class="review-avatar-local">

              ${esc(
                (
                  review.autorNome
                  ||
                  "U"
                )[0]
                  .toUpperCase()
              )}

            </span>
          `
      }


      <strong>

        ${esc(
          review.autorNome
          ||
          "Usuário"
        )}

      </strong>

    </div>


    ${
      mostrarLinha

        ? `
          <strong>

            Linha
            ${esc(review.numero || "")}

            ·

            ${esc(review.destino || "")}

          </strong>
        `

        : ""
    }


    <div class="review-estrelas">

      ${estrelas(review.nota)}

    </div>


    ${
      review.comentario

        ? `
          <p>

            ${esc(review.comentario)}

          </p>
        `

        : ""
    }


    ${
      review.prefixo

        ? `
          <small>

            🚌 Veículo
            ${esc(review.prefixo)}

          </small>
        `

        : ""
    }


    ${
      fotos.length

        ? `
          <div class="review-fotos">

            ${
              fotos

                .map(
                  (
                    foto,
                    indice
                  ) => `

                    <button
                      type="button"
                      data-i="${indice}"
                    >

                      <img
                        src="${esc(foto)}"
                        alt="Foto da avaliação"
                      >

                    </button>

                  `
                )

                .join("")
            }

          </div>
        `

        : ""
    }

  `;


  item
    .querySelectorAll(
      ".review-fotos button"
    )

    .forEach(
      botao => {

        botao.onclick =
          () =>
            ampliarFoto(
              fotos[
                Number(
                  botao.dataset.i
                )
              ]
            );

      }
    );


  return item;
}


async function abrirModalReviews(
  linha,
  ponto
) {
  if (
    state.modoNavegacao
  ) {
    return;
  }


  state.linhaReviews =
    linha;


  state.pontoReviews =
    ponto;


  state.filtroReviews =
    0;


  if (
    $("tituloReviews")
  ) {
    $("tituloReviews")
      .textContent =
      `${numeroLinha(linha)} · ${sentidoLinha(linha)}`;
  }


  renderizarReviews();


  $("modalReviews")
    ?.classList
    .remove(
      "oculto"
    );
}


function fecharModalReviews() {
  $("modalReviews")
    ?.classList
    .add(
      "oculto"
    );
}


function filtrarReviews(
  nota
) {
  state.filtroReviews =
    Number(
      nota
    );


  renderizarReviews();
}


function renderizarReviews() {
  const box =
    $("listaReviews");


  if (
    !box
    ||
    !state.linhaReviews
  ) {
    return;
  }


  let reviews =
    reviewsDaLinha(
      state.linhaReviews
    );


  if (
    state.filtroReviews
  ) {
    reviews =
      reviews.filter(
        review =>
          Number(
            review.nota
          ) ===
          state.filtroReviews
      );
  }


  box.innerHTML =
    "";


  if (
    !reviews.length
  ) {
    box.innerHTML = `

      <div class="sem-reviews">

        Nenhuma avaliação encontrada.

      </div>

    `;


    return;
  }


  const fragmento =
    document.createDocumentFragment();


  for (
    const review
    of
    reviews
  ) {
    fragmento.appendChild(
      criarReview(
        review
      )
    );
  }


  box.appendChild(
    fragmento
  );
}


function avaliarPeloModalReviews() {
  const linha =
    state.linhaReviews;


  const ponto =
    state.pontoReviews;


  fecharModalReviews();


  if (
    linha
  ) {
    abrirModalAvaliacao(
      linha,
      ponto
    );
  }
}


function abrirMinhasAvaliacoes() {
  if (
    !exigirPerfilLocal()
    ||
    state.modoNavegacao
  ) {
    return;
  }


  const box =
    $("listaMinhasAvaliacoes");


  if (
    !box
  ) {
    return;
  }


  const reviews =
    arr(
      lerStorage(
        CONFIG.storage.avaliacoes,
        []
      )
    )

      .filter(
        item =>
          item.autorId ===
          state.usuario.id
      )

      .sort(
        (
          a,
          b
        ) =>
          new Date(
            b.criado_em
            ||
            0
          )
          -
          new Date(
            a.criado_em
            ||
            0
          )
      );


  box.innerHTML =
    "";


  if (
    !reviews.length
  ) {
    box.innerHTML = `

      <div class="sem-reviews">

        Você ainda não fez avaliações.

      </div>

    `;
  }

  else {
    const fragmento =
      document.createDocumentFragment();


    for (
      const review
      of
      reviews
    ) {
      fragmento.appendChild(
        criarReview(
          review,
          true
        )
      );
    }


    box.appendChild(
      fragmento
    );
  }


  $("modalMinhasAvaliacoes")
    ?.classList
    .remove(
      "oculto"
    );
}


function fecharMinhasAvaliacoes() {
  $("modalMinhasAvaliacoes")
    ?.classList
    .add(
      "oculto"
    );
}


/* =========================================================
   FLASH
========================================================= */

function garantirModalFlash() {
  let modal =
    $("modalFlash");


  if (
    modal
  ) {
    return modal;
  }


  modal =
    document.createElement(
      "div"
    );


  modal.id =
    "modalFlash";


  modal.className =
    "modal-fundo oculto";


  modal.innerHTML = `

    <div class="modal">

      <button
        id="fecharFlash"
        type="button"
      >

        ×

      </button>


      <div id="conteudoModalFlash"></div>

    </div>

  `;


  document.body
    .appendChild(
      modal
    );


  $("fecharFlash")
    .onclick =
    fecharModalFlash;


  return modal;
}


function flashesDaLinha(
  linha
) {
  const agora =
    Date.now();


  const todos =
    arr(
      lerStorage(
        CONFIG.storage.flash,
        []
      )
    );


  const ativos =
    todos.filter(
      flash =>
        new Date(
          flash.expira_em
          ||
          0
        )
          .getTime()
        >
        agora
    );


  if (
    ativos.length !==
    todos.length
  ) {
    salvarStorage(
      CONFIG.storage.flash,
      ativos
    );
  }


  return ativos.filter(
    flash =>
      flash.linha ===
      chaveLinha(
        linha
      )
  );
}


async function abrirAvaliacoesFlash(
  linha,
  ponto
) {
  if (
    state.modoNavegacao
  ) {
    return;
  }


  state.linhaFlash =
    linha;


  state.pontoFlash =
    ponto;


  renderFlash();
}


function renderFlash() {
  const modal =
    garantirModalFlash();


  const flashes =
    flashesDaLinha(
      state.linhaFlash
    );


  $("conteudoModalFlash")
    .innerHTML = `

      <h2>

        ⚡ Flash

      </h2>


      <strong>

        ${esc(
          numeroLinha(
            state.linhaFlash
          )
        )}

      </strong>


      <div>

        Sentido →

        ${esc(
          sentidoLinha(
            state.linhaFlash
          )
        )}

      </div>


      ${
        usuarioLogado()

          ? `
            <textarea
              id="textoAvaliacaoFlash"
              maxlength="280"
              placeholder="O que está acontecendo agora?"
            ></textarea>


            <button
              id="enviarAvaliacaoFlash"
              type="button"
            >

              Publicar como
              ${esc(state.usuario.nome)}

            </button>
          `

          : `
            <button
              id="entrarParaFlash"
              class="perfil-local-salvar"
              type="button"
            >

              Entrar para publicar

            </button>
          `
      }


      <div>

        ${
          flashes

            .map(
              flash => `

                <article class="flash-item">

                  <strong>

                    ${esc(
                      flash.autorNome
                      ||
                      "Usuário"
                    )}

                  </strong>


                  <p>

                    ${esc(
                      flash.texto
                    )}

                  </p>

                </article>

              `
            )

            .join("")
        }

      </div>

    `;


  $("enviarAvaliacaoFlash")
    ?.addEventListener(
      "click",
      salvarAvaliacaoFlashAtual
    );


  $("entrarParaFlash")
    ?.addEventListener(
      "click",
      abrirLoginLocal
    );


  modal.classList
    .remove(
      "oculto"
    );
}


function salvarAvaliacaoFlashAtual() {
  if (
    !exigirPerfilLocal()
  ) {
    return;
  }


  const texto =
    $("textoAvaliacaoFlash")
      ?.value
      .trim();


  if (
    !texto
  ) {
    return;
  }


  const lista =
    arr(
      lerStorage(
        CONFIG.storage.flash,
        []
      )
    );


  lista.unshift({
    id:
      gerarId(),

    autorId:
      state.usuario.id,

    autorNome:
      state.usuario.nome,

    autorFoto:
      state.usuario.foto
      ||
      "",

    linha:
      chaveLinha(
        state.linhaFlash
      ),

    numero:
      numeroLinha(
        state.linhaFlash
      ),

    destino:
      destino(
        state.linhaFlash
      ),

    ponto:
      nomePonto(
        state.pontoFlash
      ),

    texto,

    criado_em:
      new Date()
        .toISOString(),

    expira_em:
      new Date(
        Date.now()
        +
        CONFIG.flashMs
      )
        .toISOString()
  });


  salvarStorage(
    CONFIG.storage.flash,
    lista
  );


  renderFlash();
}


function fecharModalFlash() {
  $("modalFlash")
    ?.classList
    .add(
      "oculto"
    );
}


/* =========================================================
   LUGARES SALVOS
========================================================= */

function meusLugares() {
  if (
    !usuarioLogado()
  ) {
    return [];
  }


  return arr(
    lerStorage(
      CONFIG.storage.lugares,
      []
    )
  )

    .filter(
      lugar =>
        lugar.autorId ===
        state.usuario.id
    );
}


function renderizarLugaresMenu() {
  const box =
    $("lista-lugares-menu");


  if (
    !box
  ) {
    return;
  }


  if (
    !usuarioLogado()
  ) {
    box.innerHTML = `

      <button
        class="menu-login-lugares"
        type="button"
      >

        Entrar para ver lugares salvos

      </button>

    `;


    box.querySelector(
      "button"
    ).onclick =
      abrirLoginLocal;


    return;
  }


  const lugares =
    meusLugares();


  box.innerHTML =
    "";


  if (
    !lugares.length
  ) {
    box.innerHTML = `

      <div class="menu-vazio">

        Nenhum lugar salvo.

      </div>

    `;


    return;
  }


  for (
    const lugar
    of
    lugares
  ) {
    const item =
      document.createElement(
        "div"
      );


    item.className =
      "lugar-menu-card";


    item.innerHTML = `

      <button
        class="lugar-menu-principal"
        type="button"
      >

        ${esc(
          lugar.icone
          ||
          "📍"
        )}

        <strong>

          ${esc(
            lugar.nome
          )}

        </strong>

      </button>


      <button
        class="lugar-menu-editar"
        type="button"
      >

        ⋯

      </button>

    `;


    item.querySelector(
      ".lugar-menu-principal"
    ).onclick =
      () =>
        irParaLugar(
          lugar.id
        );


    item.querySelector(
      ".lugar-menu-editar"
    ).onclick =
      () =>
        editarLugar(
          lugar.id
        );


    box.appendChild(
      item
    );
  }
}


function abrirModalNovoLugar() {
  if (
    !exigirPerfilLocal()
    ||
    state.modoNavegacao
  ) {
    return;
  }


  state.lugarId =
    null;


  state.lugarLat =
    null;


  state.lugarLon =
    null;


  if (
    $("nomeLugar")
  ) {
    $("nomeLugar")
      .value =
      "";
  }


  if (
    $("enderecoLugar")
  ) {
    $("enderecoLugar")
      .value =
      "";
  }


  if (
    $("iconeLugar")
  ) {
    $("iconeLugar")
      .value =
      "📍";
  }


  $("botaoExcluirLugar")
    ?.classList
    .add(
      "oculto"
    );


  $("modalLugar")
    ?.classList
    .remove(
      "oculto"
    );
}


function editarLugar(
  id
) {
  if (
    !exigirPerfilLocal()
    ||
    state.modoNavegacao
  ) {
    return;
  }


  const lugar =
    meusLugares()
      .find(
        item =>
          String(
            item.id
          ) ===
          String(
            id
          )
      );


  if (
    !lugar
  ) {
    return;
  }


  state.lugarId =
    lugar.id;


  state.lugarLat =
    Number(
      lugar.lat
    );


  state.lugarLon =
    Number(
      lugar.lon
    );


  if (
    $("nomeLugar")
  ) {
    $("nomeLugar")
      .value =
      lugar.nome
      ||
      "";
  }


  if (
    $("enderecoLugar")
  ) {
    $("enderecoLugar")
      .value =
      lugar.endereco
      ||
      "";
  }


  if (
    $("iconeLugar")
  ) {
    $("iconeLugar")
      .value =
      lugar.icone
      ||
      "📍";
  }


  $("botaoExcluirLugar")
    ?.classList
    .remove(
      "oculto"
    );


  $("modalLugar")
    ?.classList
    .remove(
      "oculto"
    );


  mostrarMarcadorLugar();
}


function fecharModalLugar() {
  state.marcandoLugar =
    false;


  $("modalLugar")
    ?.classList
    .add(
      "oculto"
    );


  limparMarcadorLugar();
}


function usarMinhaLocalizacaoNoLugar() {
  if (
    !Number.isFinite(
      state.lat
    )
    ||
    !Number.isFinite(
      state.lon
    )
  ) {
    return;
  }


  state.lugarLat =
    state.lat;


  state.lugarLon =
    state.lon;


  mostrarMarcadorLugar();
}


function marcarLugarNoMapa() {
  if (
    !exigirPerfilLocal()
    ||
    state.modoNavegacao
  ) {
    return;
  }


  state.marcandoLugar =
    true;


  $("modalLugar")
    ?.classList
    .add(
      "oculto"
    );
}


function cancelarMarcacaoLugar() {
  state.marcandoLugar =
    false;


  $("modalLugar")
    ?.classList
    .remove(
      "oculto"
    );
}


function limparMarcadorLugar() {
  if (
    state.marcadorLugar
    &&
    map.hasLayer(
      state.marcadorLugar
    )
  ) {
    map.removeLayer(
      state.marcadorLugar
    );
  }


  state.marcadorLugar =
    null;
}


function mostrarMarcadorLugar() {
  limparMarcadorLugar();


  if (
    Number.isFinite(
      state.lugarLat
    )
    &&
    Number.isFinite(
      state.lugarLon
    )
    &&
    dentroDeSaoPaulo(
      state.lugarLat,
      state.lugarLon
    )
    &&
    !state.modoNavegacao
  ) {
    state.marcadorLugar =
      L.marker(
        [
          state.lugarLat,
          state.lugarLon
        ],
        {
          icon:
            tempPlaceIcon,

          keyboard:
            false
        }
      )

        .addTo(
          map
        );
  }
}


map.on(
  "click",
  evento => {

    if (
      !state.marcandoLugar
      ||
      state.modoNavegacao
    ) {
      return;
    }


    if (
      !dentroDeSaoPaulo(
        evento.latlng.lat,
        evento.latlng.lng
      )
    ) {
      return;
    }


    state.lugarLat =
      evento.latlng.lat;


    state.lugarLon =
      evento.latlng.lng;


    state.marcandoLugar =
      false;


    $("modalLugar")
      ?.classList
      .remove(
        "oculto"
      );


    mostrarMarcadorLugar();

  }
);


async function buscarEnderecoLugar() {
  const termo =
    $("enderecoLugar")
      ?.value
      .trim();


  if (
    !termo
  ) {
    return;
  }


  const locais =
    await buscarLocais(
      termo
    );


  if (
    !locais.length
  ) {
    alert(
      "Local não encontrado em São Paulo."
    );


    return;
  }


  state.lugarLat =
    locais[0].lat;


  state.lugarLon =
    locais[0].lon;


  mostrarMarcadorLugar();


  map.setView(
    [
      state.lugarLat,
      state.lugarLon
    ],

    17,

    {
      animate:
        false
    }
  );
}


function salvarLugarAtual() {
  if (
    !exigirPerfilLocal()
  ) {
    return;
  }


  const nome =
    $("nomeLugar")
      ?.value
      .trim();


  if (
    !nome
    ||
    !Number.isFinite(
      state.lugarLat
    )
    ||
    !Number.isFinite(
      state.lugarLon
    )
  ) {
    alert(
      "Preencha o nome e a localização."
    );


    return;
  }


  let lista =
    arr(
      lerStorage(
        CONFIG.storage.lugares,
        []
      )
    );


  const dados = {
    id:
      state.lugarId
      ||
      gerarId(),

    autorId:
      state.usuario.id,

    nome,

    endereco:
      $("enderecoLugar")
        ?.value
        .trim()
      ||
      "",

    icone:
      $("iconeLugar")
        ?.value
      ||
      "📍",

    lat:
      state.lugarLat,

    lon:
      state.lugarLon
  };


  lista =
    lista.filter(
      item =>
        String(
          item.id
        ) !==
        String(
          dados.id
        )
    );


  lista.push(
    dados
  );


  salvarStorage(
    CONFIG.storage.lugares,
    lista
  );


  fecharModalLugar();


  renderizarLugaresMenu();
}


function excluirLugarAtual() {
  if (
    !state.lugarId
    ||
    !usuarioLogado()
  ) {
    return;
  }


  const lista =
    arr(
      lerStorage(
        CONFIG.storage.lugares,
        []
      )
    )

      .filter(
        lugar =>
          String(
            lugar.id
          ) !==
          String(
            state.lugarId
          )
      );


  salvarStorage(
    CONFIG.storage.lugares,
    lista
  );


  fecharModalLugar();


  renderizarLugaresMenu();
}


function irParaLugar(
  id
) {
  const lugar =
    meusLugares()
      .find(
        item =>
          String(
            item.id
          ) ===
          String(
            id
          )
      );


  if (
    !lugar
  ) {
    return;
  }


  fecharMenu();


  map.setView(
    [
      Number(
        lugar.lat
      ),

      Number(
        lugar.lon
      )
    ],

    17,

    {
      animate:
        false
    }
  );
}


function atualizarCoordenadasLugar(
  lat,
  lon
) {
  const latitude =
    Number(
      lat
    );


  const longitude =
    Number(
      lon
    );


  if (
    !dentroDeSaoPaulo(
      latitude,
      longitude
    )
  ) {
    return;
  }


  state.lugarLat =
    latitude;


  state.lugarLon =
    longitude;


  mostrarMarcadorLugar();
}


/* =========================================================
   PAINEL DE ROTA
========================================================= */

function abrirPainelRota() {
  if (
    !state.modoNavegacao
  ) {
    $("painel-rota")
      ?.classList
      .remove(
        "oculto"
      );
  }
}


function fecharPainelRota() {
  $("painel-rota")
    ?.classList
    .add(
      "oculto"
    );
}


async function buscarRotasDiretas(
  destinoBusca
) {
  const controller =
    new AbortController();


  return buscarRotasBackendDestino(
    destinoBusca,
    controller.signal
  );
}


/* =========================================================
   SP156
========================================================= */

function garantirAreaFotosReclamacao() {
  const modal =
    $("modalSP156");


  if (
    !modal
    ||
    $("areaFotosReclamacao")
  ) {
    return;
  }


  const corpo =
    modal.querySelector(
      "form"
    )
    ||
    modal.querySelector(
      ".modal"
    )
    ||
    modal;


  const area =
    document.createElement(
      "section"
    );


  area.id =
    "areaFotosReclamacao";


  area.className =
    "reclamacao-fotos";


  area.innerHTML = `

    <strong>

      📎 Fotos da reclamação

    </strong>


    <div>

      <button
        id="cameraReclamacao"
        type="button"
      >

        📷 Tirar foto

      </button>


      <button
        id="galeriaReclamacao"
        type="button"
      >

        🖼️ Galeria

      </button>

    </div>


    <small id="contadorFotosReclamacao"></small>


    <div id="previewFotosReclamacao"></div>

  `;


  corpo.appendChild(
    area
  );


  const input =
    document.createElement(
      "input"
    );


  input.type =
    "file";


  input.name =
    "fotos[]";


  input.multiple =
    true;


  input.hidden =
    true;


  corpo.appendChild(
    input
  );


  state.inputMestreReclamacao =
    input;


  $("cameraReclamacao")
    .onclick =
    () =>
      escolherFotosReclamacao(
        true
      );


  $("galeriaReclamacao")
    .onclick =
    () =>
      escolherFotosReclamacao(
        false
      );
}


async function escolherFotosReclamacao(
  camera
) {
  const files =
    await escolherArquivo({
      camera,

      multiple:
        !camera
    });


  for (
    const file
    of
    files
  ) {
    if (
      state.reclamacaoFotos.length >=
      CONFIG.maxFotos
    ) {
      break;
    }


    if (
      !file.type
        .startsWith(
          "image/"
        )

      ||

      file.size >
      CONFIG.maxFotoBytes
    ) {
      continue;
    }


    state.reclamacaoFotos.push({
      id:
        gerarId(),

      file,

      url:
        URL.createObjectURL(
          file
        )
    });
  }


  renderFotosReclamacao();
}


function renderFotosReclamacao() {
  if (
    $("contadorFotosReclamacao")
  ) {
    $("contadorFotosReclamacao")
      .textContent =
      `${state.reclamacaoFotos.length}/${CONFIG.maxFotos} fotos`;
  }


  const box =
    $("previewFotosReclamacao");


  if (
    box
  ) {
    box.innerHTML =
      "";


    for (
      const foto
      of
      state.reclamacaoFotos
    ) {
      const item =
        document.createElement(
          "div"
        );


      item.className =
        "reclamacao-foto-card";


      item.innerHTML = `

        <img
          src="${foto.url}"
          alt=""
        >


        <button
          type="button"
        >

          ×

        </button>

      `;


      item.querySelector(
        "button"
      ).onclick =
        () => {

          URL.revokeObjectURL(
            foto.url
          );


          state.reclamacaoFotos =
            state.reclamacaoFotos

              .filter(
                atual =>
                  atual.id !==
                  foto.id
              );


          renderFotosReclamacao();

        };


      box.appendChild(
        item
      );
    }
  }


  if (
    state.inputMestreReclamacao
    &&
    typeof DataTransfer !==
    "undefined"
  ) {
    const dt =
      new DataTransfer();


    for (
      const foto
      of
      state.reclamacaoFotos
    ) {
      dt.items.add(
        foto.file
      );
    }


    state.inputMestreReclamacao.files =
      dt.files;
  }
}


function abrirModalSP156() {
  if (
    state.modoNavegacao
  ) {
    return;
  }


  garantirAreaFotosReclamacao();


  $("modalSP156")
    ?.classList
    .remove(
      "oculto"
    );
}


function fecharModalSP156() {
  $("modalSP156")
    ?.classList
    .add(
      "oculto"
    );
}


function limparFotosReclamacao() {
  for (
    const foto
    of
    state.reclamacaoFotos
  ) {
    if (
      foto.url
    ) {
      URL.revokeObjectURL(
        foto.url
      );
    }
  }


  state.reclamacaoFotos =
    [];


  renderFotosReclamacao();
}


function obterFotosReclamacao() {
  return state.reclamacaoFotos

    .map(
      item =>
        item.file
    );
}


function adicionarFotosReclamacaoAoFormData(
  formData,
  nome = "fotos[]"
) {
  for (
    const file
    of
    obterFotosReclamacao()
  ) {
    formData.append(
      nome,
      file,
      file.name
    );
  }


  return formData;
}


/* =========================================================
   CSS EXTRA
========================================================= */

function estilosExtras() {
  if (
    $("busreview-extra-css")
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "busreview-extra-css";


  style.textContent = `

    .busreview-leaflet-stop{
      background:transparent!important;
      border:0!important;
    }

    .busreview-stop-wrapper{
      position:relative;
      width:46px;
      height:50px;
      transform-origin:50% 100%;
    }

    .busreview-stop-wrapper.selecionado{
      transform:scale(1.16);
    }

    .busreview-stop-pin{
      position:absolute;
      left:5px;
      top:0;
      width:36px;
      height:36px;
      box-sizing:border-box;
      display:grid;
      place-items:center;
      border:3px solid #fff;
      border-radius:10px;
      background:#1687E8;
      box-shadow:0 2px 6px #0003;
    }

    .busreview-stop-pin:after{
      content:"";
      position:absolute;
      left:50%;
      bottom:-8px;
      width:15px;
      height:15px;
      background:#1687E8;
      transform:translateX(-50%) rotate(45deg);
      z-index:-1;
    }

    .busreview-stop-bus{
      position:relative;
      width:22px;
      height:23px;
      background:#fff;
      border-radius:6px 6px 4px 4px;
    }

    .bus-window{
      position:absolute;
      left:4px;
      top:4px;
      width:14px;
      height:7px;
      border-radius:2px;
      background:#1687E8;
    }

    .bus-light{
      position:absolute;
      width:4px;
      height:4px;
      bottom:5px;
      border-radius:50%;
      background:#1687E8;
    }

    .bus-light.l{
      left:4px;
    }

    .bus-light.r{
      right:4px;
    }

    .bus-wheel{
      position:absolute;
      bottom:-3px;
      width:5px;
      height:5px;
      border-radius:50%;
      background:#fff;
    }

    .bus-wheel.l{
      left:3px;
    }

    .bus-wheel.r{
      right:3px;
    }

    .busreview-stop-direction{
      position:absolute;
      display:grid;
      place-items:center;
      width:22px;
      height:22px;
      border:2px solid #fff;
      border-radius:50%;
      background:#fff;
      color:#1687E8;
      font-size:17px;
      font-weight:1000;
      box-shadow:0 2px 5px #0003;
      z-index:4;
    }

    .busreview-stop-direction.seta-direita{
      right:0;
      bottom:1px;
    }

    .busreview-stop-direction.seta-esquerda{
      left:0;
      bottom:1px;
    }

    .busreview-stop-direction.seta-cima{
      right:0;
      top:-4px;
    }

    .busreview-stop-direction.seta-baixo{
      right:0;
      bottom:-1px;
    }

    .busreview-stop-direction.seta-dupla{
      left:0;
      bottom:1px;
      font-size:14px;
    }

    .user-marker-padrao{
      width:30px;
      height:30px;
      box-sizing:border-box;
      border:4px solid #fff;
      border-radius:50%;
      background:#1687E8;
      box-shadow:
        0 0 0 7px #1687e82e,
        0 2px 8px #0004;
      display:grid;
      place-items:center;
    }

    .user-marker-padrao span{
      width:8px;
      height:8px;
      border-radius:50%;
      background:#fff;
    }

    .user-marker-foto{
      width:44px;
      height:44px;
      overflow:hidden;
      border:3px solid #fff;
      border-radius:50%;
      background:#fff;
      box-shadow:
        0 0 0 7px #1687e824,
        0 2px 8px #0004;
    }

    .user-marker-foto img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .resultado-busca-item{
      display:flex;
      flex-direction:column;
      gap:5px;
      width:100%;
      padding:13px 14px;
      border:0;
      border-bottom:1px solid #edf0f2;
      background:#fff;
      text-align:left;
      cursor:pointer;
    }

    .resultado-busca-secao{
      padding:10px 14px 7px;
      background:#f5f7f9;
      color:#65717b;
      font-size:11px;
      font-weight:900;
    }

    .resultado-linha-numero{
      width:max-content;
      padding:6px 10px;
      border-radius:999px;
      background:#1687E8;
      color:#fff;
      font-weight:900;
    }

    .resultado-ponto-mais-proximo{
      display:flex;
      flex-direction:column;
      gap:3px;
      margin-top:7px;
      padding:10px 11px;
      border-radius:11px;
      background:#eef7ff;
      border-left:3px solid #1687E8;
    }

    .resultado-ponto-mais-proximo small,
    .resultado-distancia-ponto{
      color:#1687E8;
      font-weight:900;
    }

    .linha-pesquisa-destaque{
      border:2px solid #1687E8!important;
      border-radius:15px;
      background:#f4faff!important;
    }

    .linha-pesquisa-aviso{
      width:max-content;
      margin:2px 0 9px;
      padding:5px 9px;
      border-radius:999px;
      background:#1687E8;
      color:#fff;
      font-size:9px;
      font-weight:900;
    }

    .linha-sentido-box{
      margin-top:7px;
      padding:9px 11px;
      border-radius:11px;
      background:#edf6fe;
    }

    .previsao-item{
      display:flex;
      justify-content:space-between;
      gap:12px;
      padding:10px 0;
    }

    .acoes-linha{
      display:flex;
      flex-wrap:wrap;
      gap:7px;
      margin-top:9px;
    }

    .botao-ir-ponto{
      width:100%;
      min-height:44px;
      border:0;
      border-radius:12px;
      background:#1687E8;
      color:#fff;
      font-weight:900;
      cursor:pointer;
    }

    .painel-navegacao-ponto{
      position:fixed;
      inset:0;
      z-index:4500;
      pointer-events:none;
    }

    .painel-navegacao-ponto.oculto{
      display:none;
    }

    .navegacao-fechar-vermelho{
      position:absolute;
      top:max(18px,env(safe-area-inset-top));
      right:18px;
      z-index:4600;
      width:50px;
      height:50px;
      display:grid;
      place-items:center;
      border:3px solid #fff;
      border-radius:50%;
      background:#e53935;
      color:#fff;
      font-size:34px;
      font-weight:900;
      pointer-events:auto;
      box-shadow:0 4px 14px #0005;
    }

    .busreview-modo-rota
    .leaflet-control-container{
      display:none!important;
    }

    .busreview-auth{
      padding:10px 12px;
      background:#fff;
    }

    .perfil-menu-login,
    .perfil-local-salvar{
      width:100%;
      min-height:44px;
      border:0;
      border-radius:12px;
      background:#1687E8;
      color:#fff;
      font-weight:900;
      cursor:pointer;
    }

    .auth-logado{
      display:flex;
      align-items:center;
      gap:8px;
    }

    .auth-logado img,
    .auth-avatar{
      width:40px;
      height:40px;
      border-radius:50%;
      object-fit:cover;
    }

    .auth-avatar{
      display:grid;
      place-items:center;
      background:#eaf5ff;
      color:#1687E8;
      font-weight:900;
    }

    .auth-dados{
      min-width:0;
      flex:1;
    }

    .auth-dados strong,
    .auth-dados small{
      display:block;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }

    .auth-logado button{
      border:0;
      border-radius:9px;
      padding:8px;
      background:#f1f3f5;
      cursor:pointer;
    }

    .auth-modal-fundo{
      position:fixed;
      inset:0;
      z-index:6000;
      display:grid;
      place-items:center;
      padding:18px;
      background:#0007;
    }

    .auth-modal-fundo.oculto{
      display:none;
    }

    .auth-modal{
      position:relative;
      width:min(380px,100%);
      padding:25px 22px;
      border-radius:20px;
      background:#fff;
    }

    .auth-fechar{
      position:absolute;
      right:10px;
      top:10px;
      width:38px;
      height:38px;
      border:0;
      border-radius:50%;
      font-size:24px;
    }

    .perfil-local-texto{
      color:#65717b;
      line-height:1.45;
    }

    .perfil-foto-botao{
      width:100%;
      display:flex;
      align-items:center;
      gap:12px;
      padding:10px;
      margin:16px 0;
      border:1px solid #dce2e7;
      border-radius:12px;
      background:#fff;
      cursor:pointer;
    }

    .perfil-foto-preview{
      width:54px;
      height:54px;
      display:grid;
      place-items:center;
      overflow:hidden;
      border-radius:50%;
      background:#eef3f6;
      font-size:25px;
    }

    .perfil-foto-preview img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .perfil-local-label{
      display:block;
      margin:8px 0 5px;
      font-weight:800;
    }

    .perfil-local-input{
      width:100%;
      box-sizing:border-box;
      padding:12px;
      border:1px solid #d7dde2;
      border-radius:10px;
      font-size:16px;
    }

    .perfil-local-salvar{
      margin-top:12px;
    }

    .perfil-local-aviso{
      display:block;
      margin-top:10px;
      color:#7a858e;
    }

    .review-autor{
      display:flex;
      align-items:center;
      gap:8px;
      margin-bottom:7px;
    }

    .review-autor img,
    .review-avatar-local{
      width:30px;
      height:30px;
      border-radius:50%;
      object-fit:cover;
    }

    .review-avatar-local{
      display:grid;
      place-items:center;
      background:#eaf5ff;
      color:#1687E8;
      font-weight:900;
    }

    .review-estrelas{
      color:#f2aa00;
      font-size:18px;
    }

    .avaliacao-fotos-preview,
    #previewFotosReclamacao,
    .review-fotos{
      display:grid;
      grid-template-columns:repeat(2,1fr);
      gap:8px;
      margin-top:8px;
    }

    .avaliacao-foto-preview,
    .reclamacao-foto-card,
    .review-fotos button{
      position:relative;
      overflow:hidden;
      aspect-ratio:1;
      border:0;
      border-radius:10px;
      background:#eee;
      padding:0;
    }

    .avaliacao-foto-preview img,
    .reclamacao-foto-card img,
    .review-fotos img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .avaliacao-foto-preview button,
    .reclamacao-foto-card button{
      position:absolute;
      right:4px;
      top:4px;
    }

    .foto-modal{
      position:fixed;
      inset:0;
      z-index:7000;
      display:grid;
      place-items:center;
      padding:20px;
      background:#000b;
    }

    .foto-modal.oculto{
      display:none;
    }

    .foto-modal img{
      max-width:95vw;
      max-height:85vh;
      border-radius:14px;
    }

    .foto-modal button{
      position:absolute;
      right:18px;
      top:18px;
      width:44px;
      height:44px;
      border:0;
      border-radius:50%;
      font-size:26px;
    }

    .flash-item{
      margin-top:8px;
      padding:10px;
      border-radius:10px;
      background:#f5f7f9;
    }

  `;


  document.head
    .appendChild(
      style
    );
}


/* =========================================================
   FUNÇÕES USADAS PELO HTML
========================================================= */

Object.assign(
  window,
  {
    abrirMenu,
    fecharMenu,

    centralizarUsuario,

    abrirPonto,
    fecharPainelPonto,

    pesquisarOnibus,
    limparBuscaOnibus,

    iniciarNavegacaoAtePonto,
    pararNavegacaoPonto,

    abrirModalAvaliacao,
    fecharModalAvaliacao,

    definirNota,
    enviarAvaliacao,

    abrirModalReviews,
    fecharModalReviews,

    filtrarReviews,
    avaliarPeloModalReviews,

    ampliarFoto,

    abrirMinhasAvaliacoes,
    fecharMinhasAvaliacoes,

    abrirAvaliacoesFlash,
    fecharModalFlash,

    abrirModalSP156,
    fecharModalSP156,

    limparFotosReclamacao,
    obterFotosReclamacao,
    adicionarFotosReclamacaoAoFormData,

    abrirModalNovoLugar,
    editarLugar,
    fecharModalLugar,

    usarMinhaLocalizacaoNoLugar,
    marcarLugarNoMapa,
    cancelarMarcacaoLugar,

    buscarEnderecoLugar,
    salvarLugarAtual,
    excluirLugarAtual,

    irParaLugar,

    abrirPainelRota,
    fecharPainelRota,

    buscarRotasDiretas,

    atualizarCoordenadasLugar,

    abrirLoginLocal,
    fecharLoginLocal,

    salvarPerfilLocal,
    logoutLocal
  }
);


/* =========================================================
   INICIAR BUSREVIEW
========================================================= */

function iniciarBusReview() {
  estilosExtras();


  /*
   * Recupera o perfil salvo.
   */

  state.usuario =
    carregarPerfilLocal();


  garantirAuthUI();


  garantirPainelNavegacao();


  configurarBuscaOnibus();


  renderAuth();


  renderizarLugaresMenu();


  /*
   * Ajusta o tamanho do mapa.
   */

  setTimeout(
    () => {

      map.invalidateSize({
        animate:
          false,

        pan:
          false
      });


      ajustarZoomMinimoSP();

    },

    40
  );


  /*
   * Localização.
   */

  obterLocalizacaoReal();
}


if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    iniciarBusReview,
    {
      once:
        true
    }
  );
}

else {
  iniciarBusReview();
}
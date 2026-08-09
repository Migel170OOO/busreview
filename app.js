// ========================================
// CONFIGURAÇÃO
// ========================================

// Interlagos como localização inicial.
// Se o navegador permitir localização,
// o mapa será automaticamente centralizado
// no usuário.

const INTERLAGOS = [
    -23.7015,
    -46.7020
];

const RAIO_KM = 2;


// ========================================
// CRIAR MAPA
// ========================================

const map = L.map("map", {

    zoomControl: true

}).setView(
    INTERLAGOS,
    14
);


// ========================================
// MAPA ESCURO
// ========================================

L.tileLayer(

    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",

    {

        attribution:
            "&copy; OpenStreetMap &copy; CARTO",

        maxZoom: 19

    }

).addTo(map);


// ========================================
// VARIÁVEIS
// ========================================

let usuarioLat = INTERLAGOS[0];

let usuarioLon = INTERLAGOS[1];

let usuarioMarker = null;

let raioCircle = null;


// ========================================
// PONTOS DE ÔNIBUS
//
// POR ENQUANTO SÃO PONTOS DE TESTE.
// ========================================

const pontos = [

    {
        id: 1,

        nome:
            "Ponto Avenida Interlagos",

        lat:
            -23.7022,

        lon:
            -46.7025,

        distancia:
            "180 m"
    },


    {
        id: 2,

        nome:
            "Ponto Autódromo",

        lat:
            -23.7037,

        lon:
            -46.6995,

        distancia:
            "430 m"
    },


    {
        id: 3,

        nome:
            "Ponto Rio Bonito",

        lat:
            -23.7055,

        lon:
            -46.7050,

        distancia:
            "620 m"
    },


    {
        id: 4,

        nome:
            "Ponto Avenida Atlântica",

        lat:
            -23.6988,

        lon:
            -46.7060,

        distancia:
            "850 m"
    },


    {
        id: 5,

        nome:
            "Ponto Interlagos",

        lat:
            -23.6958,

        lon:
            -46.7010,

        distancia:
            "1,1 km"
    }

];


// ========================================
// ÔNIBUS DE CADA PONTO
//
// ESTES HORÁRIOS SÃO SIMULADOS.
// ========================================

const chegadas = {

    1: [

        {
            linha: "675A",

            destino: "Terminal Santo Amaro",

            minutos: 6,

            horario: "12:36"

        },

        {
            linha: "6021",

            destino: "Jardim Miriam",

            minutos: 12,

            horario: "12:42"

        },

        {
            linha: "637V",

            destino: "Pinheiros",

            minutos: 19,

            horario: "12:49"

        }

    ],


    2: [

        {
            linha: "675A",

            destino: "Terminal Santo Amaro",

            minutos: 4,

            horario: "12:34"

        },

        {
            linha: "637V",

            destino: "Pinheiros",

            minutos: 15,

            horario: "12:45"

        }

    ],


    3: [

        {
            linha: "6021",

            destino: "Jardim Miriam",

            minutos: 7,

            horario: "12:37"

        },

        {
            linha: "675A",

            destino: "Terminal Santo Amaro",

            minutos: 17,

            horario: "12:47"

        }

    ],


    4: [

        {
            linha: "637V",

            destino: "Pinheiros",

            minutos: 9,

            horario: "12:39"

        },

        {
            linha: "6021",

            destino: "Jardim Miriam",

            minutos: 21,

            horario: "12:51"

        }

    ],


    5: [

        {
            linha: "675A",

            destino: "Terminal Santo Amaro",

            minutos: 5,

            horario: "12:35"

        },

        {
            linha: "6021",

            destino: "Jardim Miriam",

            minutos: 14,

            horario: "12:44"

        }

    ]

};


// ========================================
// ÍCONE DOS PONTOS
// ========================================

const stopIcon =
    L.divIcon({

        className: "",

        html: `
            <div class="stop-marker">
                🚌
            </div>
        `,

        iconSize: [
            31,
            31
        ],

        iconAnchor: [
            15,
            15
        ]

    });


// ========================================
// ÍCONE DO USUÁRIO
// ========================================

const userIcon =
    L.divIcon({

        className: "",

        html: `
            <div class="user-marker"></div>
        `,

        iconSize: [
            18,
            18
        ],

        iconAnchor: [
            9,
            9
        ]

    });


// ========================================
// DESENHAR PONTOS
// ========================================

function desenharPontos() {

    pontos.forEach(
        ponto => {

            const marker =
                L.marker(

                    [
                        ponto.lat,
                        ponto.lon
                    ],

                    {
                        icon:
                            stopIcon
                    }

                ).addTo(map);


            marker.bindTooltip(
                ponto.nome
            );


            marker.on(
                "click",
                function() {

                    abrirPonto(
                        ponto
                    );

                }
            );

        }
    );

}


// ========================================
// ABRIR PONTO
// ========================================

function abrirPonto(ponto) {

    const panel =
        document.getElementById(
            "busPanel"
        );


    const nome =
        document.getElementById(
            "selectedStopName"
        );


    const distancia =
        document.getElementById(
            "selectedStopDistance"
        );


    const arrivals =
        document.getElementById(
            "arrivals"
        );


    nome.textContent =
        ponto.nome;


    distancia.textContent =
        "📍 " +
        ponto.distancia +
        " de você";


    arrivals.innerHTML = "";


    const onibus =
        chegadas[ponto.id] || [];


    if (
        onibus.length === 0
    ) {

        arrivals.innerHTML = `

            <div class="arrival-card">

                Nenhum ônibus encontrado.

            </div>

        `;

    }


    onibus.forEach(
        bus => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "arrival-card";


            card.innerHTML = `

                <div class="arrival-top">

                    <div class="line-number">

                        ${bus.linha}

                    </div>

                    <div class="arrival-time">

                        ${bus.minutos} min

                    </div>

                </div>


                <div class="destination">

                    ${bus.destino}

                </div>


                <div class="arrival-status">

                    Previsão:
                    ${bus.horario}

                </div>

            `;


            arrivals.appendChild(
                card
            );

        }
    );


    panel.classList.add(
        "open"
    );

}


// ========================================
// FECHAR PAINEL
// ========================================

function fecharPainel() {

    document
        .getElementById(
            "busPanel"
        )
        .classList.remove(
            "open"
        );

}


// ========================================
// CRIAR LOCALIZAÇÃO DO USUÁRIO
// ========================================

function atualizarLocalizacao(
    lat,
    lon
) {

    usuarioLat = lat;

    usuarioLon = lon;


    if (
        usuarioMarker
    ) {

        usuarioMarker.setLatLng(
            [
                lat,
                lon
            ]
        );

    } else {

        usuarioMarker =
            L.marker(

                [
                    lat,
                    lon
                ],

                {
                    icon:
                        userIcon,

                    zIndexOffset:
                        1000
                }

            ).addTo(map);


        usuarioMarker.bindTooltip(
            "Você está aqui"
        );

    }


    // Círculo de 2 km

    if (
        raioCircle
    ) {

        raioCircle.setLatLng(
            [
                lat,
                lon
            ]
        );

    } else {

        raioCircle =
            L.circle(

                [
                    lat,
                    lon
                ],

                {

                    radius:
                        RAIO_KM * 1000,

                    color:
                        "#5271ff",

                    weight:
                        2,

                    opacity:
                        0.7,

                    fillColor:
                        "#5271ff",

                    fillOpacity:
                        0.08

                }

            ).addTo(map);

    }

}


// ========================================
// CENTRALIZAR NO USUÁRIO
// ========================================

function centralizarUsuario() {

    map.setView(

        [
            usuarioLat,
            usuarioLon
        ],

        14

    );

}


// ========================================
// TENTAR PEGAR LOCALIZAÇÃO REAL
// ========================================

function pegarLocalizacao() {

    if (
        !navigator.geolocation
    ) {

        atualizarLocalizacao(
            usuarioLat,
            usuarioLon
        );

        return;

    }


    navigator.geolocation.getCurrentPosition(

        function(position) {

            const lat =
                position.coords.latitude;

            const lon =
                position.coords.longitude;


            atualizarLocalizacao(
                lat,
                lon
            );


            map.setView(

                [
                    lat,
                    lon
                ],

                14

            );

        },


        function(error) {

            console.log(
                "Localização não autorizada."
            );


            // Usa Interlagos
            // como localização inicial.

            atualizarLocalizacao(
                usuarioLat,
                usuarioLon
            );

        },

        {

            enableHighAccuracy:
                true,

            timeout:
                10000,

            maximumAge:
                60000

        }

    );

}


// ========================================
// INICIAR
// ========================================

atualizarLocalizacao(

    usuarioLat,

    usuarioLon

);


desenharPontos();


pegarLocalizacao();

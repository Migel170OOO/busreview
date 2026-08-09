// ========================================
// CONFIGURAÇÃO
// ========================================

const RAIO_KM = 2;

let usuarioLat = null;
let usuarioLon = null;

let usuarioMarker = null;
let raioCircle = null;

let pontosMarkers = [];


// ========================================
// MAPA
// ========================================

const map = L.map("map").setView(
    [-23.7015, -46.7020],
    14
);


L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
        attribution:
            "&copy; OpenStreetMap &copy; CARTO",

        maxZoom: 19
    }
).addTo(map);


// ========================================
// ÍCONE DO USUÁRIO
// ========================================

const userIcon = L.divIcon({

    className: "",

    html: `
        <div class="user-marker"></div>
    `,

    iconSize: [18, 18],

    iconAnchor: [9, 9]

});


// ========================================
// ÍCONE DOS PONTOS
// BOLINHA AZUL
// ========================================

const stopIcon = L.divIcon({

    className: "",

    html: `
        <div class="stop-marker"></div>
    `,

    iconSize: [20, 20],

    iconAnchor: [10, 10]

});


// ========================================
// DISTÂNCIA ENTRE DOIS PONTOS
// ========================================

function distanciaKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R = 6371;

    const dLat =
        (lat2 - lat1)
        * Math.PI / 180;

    const dLon =
        (lon2 - lon1)
        * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +

        Math.cos(
            lat1 * Math.PI / 180
        ) *

        Math.cos(
            lat2 * Math.PI / 180
        ) *

        Math.sin(dLon / 2) ** 2;

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;

}


// ========================================
// CRIAR PONTOS AO REDOR DO USUÁRIO
// ========================================

function criarPontosPerto() {

    // Remove os pontos anteriores

    pontosMarkers.forEach(
        marker => map.removeLayer(marker)
    );

    pontosMarkers = [];


    // Quantidade de pontos

    const quantidade = 25;


    for (
        let i = 0;
        i < quantidade;
        i++
    ) {

        // Distância aleatória:
        // entre aproximadamente 100 m
        // e 2 km

        const distancia =
            0.1 +
            Math.random() * 1.9;


        // Direção aleatória

        const angulo =
            Math.random() *
            Math.PI * 2;


        // Conversão aproximada
        // de km para latitude/longitude

        const deltaLat =
            (
                distancia *
                Math.cos(angulo)
            ) / 111;


        const deltaLon =
            (
                distancia *
                Math.sin(angulo)
            ) /
            (
                111 *
                Math.cos(
                    usuarioLat *
                    Math.PI / 180
                )
            );


        const lat =
            usuarioLat + deltaLat;


        const lon =
            usuarioLon + deltaLon;


        const distanciaReal =
            distanciaKm(
                usuarioLat,
                usuarioLon,
                lat,
                lon
            );


        // Garantia de até 2 km

        if (
            distanciaReal > RAIO_KM
        ) {
            continue;
        }


        const marker =
            L.marker(
                [lat, lon],
                {
                    icon: stopIcon
                }
            ).addTo(map);


        marker.bindTooltip(
            "Ponto de ônibus"
        );


        marker.on(
            "click",
            function() {

                abrirPonto(
                    lat,
                    lon,
                    distanciaReal
                );

            }
        );


        pontosMarkers.push(
            marker
        );

    }

}


// ========================================
// LOCALIZAÇÃO DO USUÁRIO
// ========================================

function atualizarLocalizacao(
    lat,
    lon
) {

    usuarioLat = lat;

    usuarioLon = lon;


    // Marcador do usuário

    if (
        usuarioMarker
    ) {

        usuarioMarker.setLatLng(
            [lat, lon]
        );

    } else {

        usuarioMarker =
            L.marker(
                [lat, lon],
                {
                    icon: userIcon,

                    zIndexOffset: 1000
                }
            ).addTo(map);


        usuarioMarker.bindTooltip(
            "Você está aqui"
        );

    }


    // ====================================
    // CÍRCULO DE 2 KM
    // ====================================

    if (
        raioCircle
    ) {

        raioCircle.setLatLng(
            [lat, lon]
        );

    } else {

        raioCircle =
            L.circle(
                [lat, lon],
                {

                    radius:
                        2000,

                    color:
                        "#5271ff",

                    weight:
                        2,

                    opacity:
                        0.7,

                    fillColor:
                        "#5271ff",

                    fillOpacity:
                        0.06

                }
            ).addTo(map);

    }


    // ====================================
    // CRIA OS PONTOS
    // ====================================

    criarPontosPerto();


    // Centraliza

    map.setView(
        [lat, lon],
        14
    );

}


// ========================================
// PEGAR LOCALIZAÇÃO
// ========================================

function pegarLocalizacao() {

    if (
        !navigator.geolocation
    ) {

        alert(
            "Seu navegador não suporta localização."
        );

        return;

    }


    navigator.geolocation.getCurrentPosition(

        function(position) {

            atualizarLocalizacao(

                position.coords.latitude,

                position.coords.longitude

            );

        },


        function(error) {

            console.log(
                "Não foi possível obter a localização:",
                error
            );

            alert(
                "Permita o acesso à localização para mostrar os pontos perto de você."
            );

        },


        {

            enableHighAccuracy:
                true,

            timeout:
                10000,

            maximumAge:
                0

        }

    );

}


// ========================================
// CENTRALIZAR NO USUÁRIO
// ========================================

function centralizarUsuario() {

    if (
        usuarioLat === null
    ) {

        pegarLocalizacao();

        return;

    }


    map.setView(
        [
            usuarioLat,
            usuarioLon
        ],
        14
    );

}


// ========================================
// ABRIR PONTO
// ========================================

function abrirPonto(
    lat,
    lon,
    distancia
) {

    const panel =
        document.getElementById(
            "busPanel"
        );


    const nome =
        document.getElementById(
            "selectedStopName"
        );


    const distance =
        document.getElementById(
            "selectedStopDistance"
        );


    const arrivals =
        document.getElementById(
            "arrivals"
        );


    nome.textContent =
        "Ponto de ônibus";


    distance.textContent =
        "📍 " +
        Math.round(
            distancia * 1000
        ) +
        " m de você";


    // ====================================
    // DADOS SIMULADOS
    // ====================================

    const linhas = [

        {
            linha: "675A",

            destino:
                "Terminal Santo Amaro",

            minutos:
                Math.floor(
                    Math.random() * 10
                ) + 2
        },

        {
            linha: "6021",

            destino:
                "Jardim Miriam",

            minutos:
                Math.floor(
                    Math.random() * 15
                ) + 5
        },

        {
            linha: "637V",

            destino:
                "Pinheiros",

            minutos:
                Math.floor(
                    Math.random() * 20
                ) + 8
        }

    ];


    arrivals.innerHTML = "";


    linhas.forEach(
        bus => {

            const agora =
                new Date();


            agora.setMinutes(
                agora.getMinutes()
                + bus.minutos
            );


            const horario =
                agora.toLocaleTimeString(
                    "pt-BR",
                    {
                        hour: "2-digit",

                        minute: "2-digit"
                    }
                );


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
                    ${horario}

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
// INICIAR
// ========================================

pegarLocalizacao();

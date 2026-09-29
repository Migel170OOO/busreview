"use strict";

// ============================================================
// BUSREVIEW - BACKEND
// Express + GTFS + SPTrans + SQLite + Google
// ============================================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const cookieParser = require("cookie-parser");
const compression = require("compression");
const rateLimit = require("express-rate-limit");

const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");

const {
    OAuth2Client
} = require("google-auth-library");

const {
    parse
} = require("csv-parse/sync");

require("dotenv").config();

const app = express();

app.set(
    "trust proxy",
    1
);


// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PORT =
    Number(
        process.env.PORT ||
        3000
    );


const FRONTEND_DIR =
    path.join(
        __dirname,
        ".."
    );


const DATA_DIR =
    path.join(
        __dirname,
        "data"
    );


const GTFS_DIR =
    path.join(
        DATA_DIR,
        "gtfs"
    );


const UPLOAD_DIR =
    path.join(
        DATA_DIR,
        "uploads"
    );


const REVIEW_UPLOAD_DIR =
    path.join(
        UPLOAD_DIR,
        "reviews"
    );


const DB_PATH =
    process.env.DB_PATH
    ||
    path.join(
        DATA_DIR,
        "busreview.db"
    );


const RAIO_PADRAO_KM =
    1.5;


const RAIO_MAXIMO_MAPA_KM =
    Number(
        process.env.RAIO_MAXIMO_MAPA_KM
        ||
        10
    );


const CACHE_PREVISAO_MS =
    Number(
        process.env.CACHE_PREVISAO_MS
        ||
        12000
    );


const CACHE_ROTA_MS =
    Number(
        process.env.CACHE_ROTA_MS
        ||
        60000
    );


const COOKIE_NAME =
    process.env.AUTH_COOKIE_NAME
    ||
    "busreview_session";


const SESSION_DAYS =
    Number(
        process.env.SESSION_DAYS
        ||
        30
    );


const GOOGLE_CLIENT_ID =
    process.env.GOOGLE_CLIENT_ID
    ||
    "";


const VALHALLA_URL =
    process.env.VALHALLA_URL
    ||
    "https://valhalla1.openstreetmap.de/route";


const NODE_ENV =
    process.env.NODE_ENV
    ||
    "development";


let JWT_SECRET =
    process.env.JWT_SECRET
    ||
    "";


if (!JWT_SECRET) {

    if (
        NODE_ENV ===
        "production"
    ) {

        throw new Error(
            "JWT_SECRET é obrigatório em produção."
        );

    }


    JWT_SECRET =
        crypto
            .randomBytes(48)
            .toString("hex");


    console.warn(
        "[AVISO] JWT_SECRET não definido. " +
        "Uma chave temporária foi criada."
    );

}


// ============================================================
// CRIAR DIRETÓRIOS
// ============================================================

fs.mkdirSync(
    DATA_DIR,
    {
        recursive: true
    }
);


fs.mkdirSync(
    GTFS_DIR,
    {
        recursive: true
    }
);


fs.mkdirSync(
    REVIEW_UPLOAD_DIR,
    {
        recursive: true
    }
);


// ============================================================
// CORS
// ============================================================

const originsConfiguradas =
    String(
        process.env.CORS_ORIGIN ||
        ""
    )
        .split(",")
        .map(
            valor =>
                valor.trim()
        )
        .filter(Boolean);


app.use(
    cors({
        origin(
            origin,
            callback
        ) {

            if (!origin) {

                return callback(
                    null,
                    true
                );

            }


            if (
                !originsConfiguradas.length
            ) {

                return callback(
                    null,
                    true
                );

            }


            return callback(
                null,
                originsConfiguradas.includes(
                    origin
                )
            );

        },

        credentials:
            true
    })
);


// ============================================================
// MIDDLEWARES
// ============================================================

app.use(
    compression()
);


app.use(
    cookieParser()
);


app.use(
    express.json({
        limit:
            "40mb"
    })
);


app.use(
    express.urlencoded({
        extended:
            true,

        limit:
            "40mb"
    })
);


// ============================================================
// RATE LIMIT
// ============================================================

const apiLimiter =
    rateLimit({
        windowMs:
            60 * 1000,

        limit:
            240,

        standardHeaders:
            "draft-7",

        legacyHeaders:
            false
    });


const authLimiter =
    rateLimit({
        windowMs:
            60 * 1000,

        limit:
            30,

        standardHeaders:
            "draft-7",

        legacyHeaders:
            false
    });


app.use(
    "/api",
    apiLimiter
);


app.use(
    "/api/auth",
    authLimiter
);


// ============================================================
// FRONTEND
// ============================================================

app.use(
    "/uploads",
    express.static(
        UPLOAD_DIR,
        {
            immutable:
                true,

            maxAge:
                "7d"
        }
    )
);


app.use(
    express.static(
        FRONTEND_DIR
    )
);


app.get(
    "/",

    (
        req,
        res
    ) => {

        res.sendFile(
            path.join(
                FRONTEND_DIR,
                "index.html"
            )
        );

    }
);


// ============================================================
// BANCO SQLITE
// ============================================================

const db =
    new Database(
        DB_PATH
    );


db.pragma(
    "journal_mode = WAL"
);


db.pragma(
    "foreign_keys = ON"
);


db.pragma(
    "synchronous = NORMAL"
);


db.pragma(
    "busy_timeout = 5000"
);


db.exec(`

CREATE TABLE IF NOT EXISTS users (

    id TEXT PRIMARY KEY,

    google_sub TEXT NOT NULL UNIQUE,

    email TEXT,

    name TEXT NOT NULL,

    picture TEXT,

    created_at TEXT NOT NULL,

    updated_at TEXT NOT NULL

);


CREATE TABLE IF NOT EXISTS reviews (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    line_key TEXT NOT NULL,

    line_number TEXT,

    destination TEXT,

    stop_name TEXT,

    vehicle_prefix TEXT,

    rating INTEGER NOT NULL
        CHECK (
            rating BETWEEN 1 AND 5
        ),

    comment TEXT,

    crowding TEXT,

    delay TEXT,

    photos_json TEXT NOT NULL
        DEFAULT '[]',

    created_at TEXT NOT NULL,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS
idx_reviews_line_key

ON reviews(
    line_key,
    created_at DESC
);


CREATE INDEX IF NOT EXISTS
idx_reviews_user_id

ON reviews(
    user_id,
    created_at DESC
);


CREATE TABLE IF NOT EXISTS flashes (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    line_key TEXT NOT NULL,

    line_number TEXT,

    destination TEXT,

    stop_name TEXT,

    text TEXT NOT NULL,

    created_at TEXT NOT NULL,

    expires_at TEXT NOT NULL,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS
idx_flashes_line_key

ON flashes(
    line_key,
    expires_at DESC
);


CREATE INDEX IF NOT EXISTS
idx_flashes_expires_at

ON flashes(
    expires_at
);


CREATE TABLE IF NOT EXISTS places (

    id TEXT PRIMARY KEY,

    user_id TEXT NOT NULL,

    name TEXT NOT NULL,

    address TEXT,

    icon TEXT,

    lat REAL NOT NULL,

    lon REAL NOT NULL,

    created_at TEXT NOT NULL,

    updated_at TEXT NOT NULL,

    FOREIGN KEY (
        user_id
    )
    REFERENCES users(id)
    ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS
idx_places_user_id

ON places(
    user_id,
    updated_at DESC
);

`);


// ============================================================
// SQL PREPARADO
// ============================================================

const sql = {

    userUpsert:
        db.prepare(`

            INSERT INTO users (

                id,
                google_sub,
                email,
                name,
                picture,
                created_at,
                updated_at

            )

            VALUES (

                @id,
                @google_sub,
                @email,
                @name,
                @picture,
                @created_at,
                @updated_at

            )

            ON CONFLICT(
                google_sub
            )

            DO UPDATE SET

                email =
                    excluded.email,

                name =
                    excluded.name,

                picture =
                    excluded.picture,

                updated_at =
                    excluded.updated_at

        `),


    userBySub:
        db.prepare(

            "SELECT * FROM users " +
            "WHERE google_sub = ?"

        ),


    userById:
        db.prepare(

            "SELECT * FROM users " +
            "WHERE id = ?"

        ),


    reviewInsert:
        db.prepare(`

            INSERT INTO reviews (

                id,

                user_id,

                line_key,

                line_number,

                destination,

                stop_name,

                vehicle_prefix,

                rating,

                comment,

                crowding,

                delay,

                photos_json,

                created_at

            )

            VALUES (

                @id,

                @user_id,

                @line_key,

                @line_number,

                @destination,

                @stop_name,

                @vehicle_prefix,

                @rating,

                @comment,

                @crowding,

                @delay,

                @photos_json,

                @created_at

            )

        `),


    reviewsByLine:
        db.prepare(`

            SELECT

                r.*,

                u.name
                    AS user_name,

                u.picture
                    AS user_picture

            FROM reviews r

            JOIN users u
                ON u.id = r.user_id

            WHERE
                r.line_key = ?

            ORDER BY
                r.created_at DESC

        `),


    reviewsByUser:
        db.prepare(`

            SELECT

                r.*,

                u.name
                    AS user_name,

                u.picture
                    AS user_picture

            FROM reviews r

            JOIN users u
                ON u.id = r.user_id

            WHERE
                r.user_id = ?

            ORDER BY
                r.created_at DESC

        `),


    reviewDeleteOwned:
        db.prepare(

            "DELETE FROM reviews " +
            "WHERE id = ? " +
            "AND user_id = ?"

        ),


    flashInsert:
        db.prepare(`

            INSERT INTO flashes (

                id,

                user_id,

                line_key,

                line_number,

                destination,

                stop_name,

                text,

                created_at,

                expires_at

            )

            VALUES (

                @id,

                @user_id,

                @line_key,

                @line_number,

                @destination,

                @stop_name,

                @text,

                @created_at,

                @expires_at

            )

        `),


    flashesByLine:
        db.prepare(`

            SELECT

                f.*,

                u.name
                    AS user_name,

                u.picture
                    AS user_picture

            FROM flashes f

            JOIN users u
                ON u.id = f.user_id

            WHERE

                f.line_key = ?

                AND

                f.expires_at > ?

            ORDER BY
                f.created_at DESC

        `),


    flashDeleteExpired:
        db.prepare(

            "DELETE FROM flashes " +
            "WHERE expires_at <= ?"

        ),


    placesByUser:
        db.prepare(

            "SELECT * FROM places " +
            "WHERE user_id = ? " +
            "ORDER BY updated_at DESC"

        ),


    placeByIdOwned:
        db.prepare(

            "SELECT * FROM places " +
            "WHERE id = ? " +
            "AND user_id = ?"

        ),


    placeInsert:
        db.prepare(`

            INSERT INTO places (

                id,

                user_id,

                name,

                address,

                icon,

                lat,

                lon,

                created_at,

                updated_at

            )

            VALUES (

                @id,

                @user_id,

                @name,

                @address,

                @icon,

                @lat,

                @lon,

                @created_at,

                @updated_at

            )

        `),


    placeUpdateOwned:
        db.prepare(`

            UPDATE places

            SET

                name =
                    @name,

                address =
                    @address,

                icon =
                    @icon,

                lat =
                    @lat,

                lon =
                    @lon,

                updated_at =
                    @updated_at

            WHERE

                id =
                    @id

                AND

                user_id =
                    @user_id

        `),


    placeDeleteOwned:
        db.prepare(

            "DELETE FROM places " +
            "WHERE id = ? " +
            "AND user_id = ?"

        )

};


console.log(
    "SQLite:",
    DB_PATH
);


// ============================================================
// LOGIN GOOGLE
// ============================================================

const googleClient =
    GOOGLE_CLIENT_ID

        ? new OAuth2Client(
            GOOGLE_CLIENT_ID
        )

        : null;


function publicUser(
    row
) {

    if (!row) {
        return null;
    }


    return {

        id:
            row.id,

        sub:
            row.google_sub,

        nome:
            row.name,

        name:
            row.name,

        email:
            row.email ||
            "",

        foto:
            row.picture ||
            "",

        picture:
            row.picture ||
            ""

    };

}


function signSession(
    userId
) {

    return jwt.sign(

        {
            uid:
                userId
        },

        JWT_SECRET,

        {
            expiresIn:
                `${SESSION_DAYS}d`,

            issuer:
                "busreview"
        }

    );

}


function setSessionCookie(
    res,
    token
) {

    res.cookie(

        COOKIE_NAME,

        token,

        {
            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                NODE_ENV ===
                "production",

            maxAge:
                SESSION_DAYS *
                24 *
                60 *
                60 *
                1000,

            path:
                "/"
        }

    );

}


function clearSessionCookie(
    res
) {

    res.clearCookie(

        COOKIE_NAME,

        {
            httpOnly:
                true,

            sameSite:
                "lax",

            secure:
                NODE_ENV ===
                "production",

            path:
                "/"
        }

    );

}


function authOptional(
    req,
    res,
    next
) {

    req.auth =
        null;


    const token =
        req.cookies
            ?.[COOKIE_NAME];


    if (!token) {

        return next();

    }


    try {

        const payload =
            jwt.verify(

                token,

                JWT_SECRET,

                {
                    issuer:
                        "busreview"
                }

            );


        const user =
            sql.userById.get(
                String(
                    payload.uid
                )
            );


        if (user) {

            req.auth =
                publicUser(
                    user
                );

        }

    }

    catch {}


    next();

}


function requireAuth(
    req,
    res,
    next
) {

    authOptional(

        req,
        res,

        () => {

            if (
                !req.auth
            ) {

                return res
                    .status(401)
                    .json({
                        erro:
                            "Login necessário."
                    });

            }


            next();

        }

    );

}


app.post(

    "/api/auth/google",

    async (
        req,
        res,
        next
    ) => {

        try {

            if (
                !googleClient
                ||
                !GOOGLE_CLIENT_ID
            ) {

                return res
                    .status(503)
                    .json({
                        erro:
                            "GOOGLE_CLIENT_ID não configurado."
                    });

            }


            const credential =
                String(
                    req.body
                        ?.credential
                    ||
                    ""
                )
                    .trim();


            if (!credential) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Credencial Google ausente."
                    });

            }


            const ticket =
                await googleClient
                    .verifyIdToken({

                        idToken:
                            credential,

                        audience:
                            GOOGLE_CLIENT_ID

                    });


            const payload =
                ticket.getPayload();


            if (
                !payload
                    ?.sub
            ) {

                return res
                    .status(401)
                    .json({
                        erro:
                            "Credencial Google inválida."
                    });

            }


            const agora =
                new Date()
                    .toISOString();


            let user =
                sql.userBySub
                    .get(
                        payload.sub
                    );


            const id =
                user?.id
                ||
                crypto.randomUUID();


            sql.userUpsert.run({

                id,

                google_sub:
                    payload.sub,

                email:
                    payload.email
                    ||
                    "",

                name:
                    payload.name
                    ||
                    payload.email
                    ||
                    "Usuário",

                picture:
                    payload.picture
                    ||
                    "",

                created_at:
                    user?.created_at
                    ||
                    agora,

                updated_at:
                    agora

            });


            user =
                sql.userBySub
                    .get(
                        payload.sub
                    );


            setSessionCookie(

                res,

                signSession(
                    user.id
                )

            );


            return res.json({

                user:
                    publicUser(
                        user
                    )

            });

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


app.get(

    "/api/auth/me",

    authOptional,

    (
        req,
        res
    ) => {

        if (
            !req.auth
        ) {

            return res
                .status(401)
                .json({
                    erro:
                        "Não autenticado."
                });

        }


        return res.json({
            user:
                req.auth
        });

    }

);


app.post(

    "/api/auth/logout",

    (
        req,
        res
    ) => {

        clearSessionCookie(
            res
        );


        res
            .status(204)
            .end();

    }

);


// ============================================================
// GTFS
// ============================================================

let gtfsStops =
    [];


const gtfsStopPorId =
    new Map();


const gtfsRoutes =
    new Map();


const gtfsTrips =
    new Map();


const linhasPorParada =
    new Map();


const servicosGTFS =
    new Map();


const sentidosPorParada =
    new Map();


// ============================================================
// ÍNDICE ESPACIAL
// ============================================================

const GRID_CELL_DEG =
    0.01;


const spatialGrid =
    new Map();


function gridKey(
    lat,
    lon
) {

    return (

        `${Math.floor(
            Number(lat) /
            GRID_CELL_DEG
        )}|${Math.floor(
            Number(lon) /
            GRID_CELL_DEG
        )}`

    );

}


// ============================================================
// NORMALIZAÇÃO
// ============================================================

function normalizarSentidoGTFS(
    value
) {

    const numero =
        Number(
            value
        );


    /*
     * GTFS normalmente:
     *
     * 0 = direção 1
     * 1 = direção 2
     *
     * BusReview:
     *
     * 1 = ida
     * 2 = volta
     */

    if (
        numero === 0
    ) {

        return 1;

    }


    if (
        numero === 1
    ) {

        return 2;

    }


    if (
        numero === 2
    ) {

        return 2;

    }


    return 1;

}


function normalizarTexto(
    value = ""
) {

    return String(
        value
    )
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


function normalizarCodigoLinha(
    value = ""
) {

    return normalizarTexto(
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


// ============================================================
// LER GTFS
// ============================================================

function lerGTFS(
    nomeArquivo
) {

    const arquivo =
        path.join(
            GTFS_DIR,
            nomeArquivo
        );


    if (
        !fs.existsSync(
            arquivo
        )
    ) {

        throw new Error(
            `Arquivo não encontrado: ${arquivo}`
        );

    }


    return parse(

        fs.readFileSync(
            arquivo,
            "utf8"
        ),

        {
            columns:
                true,

            skip_empty_lines:
                true,

            trim:
                true,

            bom:
                true
        }

    );

}


// ============================================================
// CARREGAR PARADAS
// ============================================================

function carregarParadasGTFS() {

    const stops =
        lerGTFS(
            "stops.txt"
        );


    gtfsStops =
        stops
            .map(
                stop => ({

                    stop_id:
                        String(
                            stop.stop_id ||
                            ""
                        ),

                    stop_name:
                        stop.stop_name ||
                        "",

                    stop_desc:
                        stop.stop_desc ||
                        "",

                    lat:
                        Number(
                            stop.stop_lat
                        ),

                    lon:
                        Number(
                            stop.stop_lon
                        ),

                    search_text:
                        normalizarTexto(

                            `${
                                stop.stop_name ||
                                ""
                            } ${
                                stop.stop_desc ||
                                ""
                            }`

                        )

                })
            )
            .filter(
                stop =>

                    stop.stop_id

                    &&

                    Number.isFinite(
                        stop.lat
                    )

                    &&

                    Number.isFinite(
                        stop.lon
                    )
            );


    for (
        const stop
        of
        gtfsStops
    ) {

        gtfsStopPorId.set(
            stop.stop_id,
            stop
        );


        const chave =
            gridKey(
                stop.lat,
                stop.lon
            );


        if (
            !spatialGrid.has(
                chave
            )
        ) {

            spatialGrid.set(
                chave,
                []
            );

        }


        spatialGrid
            .get(
                chave
            )
            .push(
                stop.stop_id
            );

    }


    console.log(
        "Paradas GTFS:",
        gtfsStops.length
    );

}


// ============================================================
// CARREGAR ROTAS
// ============================================================

function carregarRotasGTFS() {

    const routes =
        lerGTFS(
            "routes.txt"
        );


    for (
        const route
        of
        routes
    ) {

        gtfsRoutes.set(

            String(
                route.route_id
            ),

            {
                route_id:
                    String(
                        route.route_id
                    ),

                shortName:
                    route.route_short_name
                    ||
                    "",

                longName:
                    route.route_long_name
                    ||
                    ""
            }

        );

    }


    console.log(
        "Rotas GTFS:",
        gtfsRoutes.size
    );

}


// ============================================================
// CARREGAR TRIPS
// ============================================================

function carregarTripsGTFS() {

    const trips =
        lerGTFS(
            "trips.txt"
        );


    for (
        const trip
        of
        trips
    ) {

        gtfsTrips.set(

            String(
                trip.trip_id
            ),

            {
                trip_id:
                    String(
                        trip.trip_id
                    ),

                route_id:
                    String(
                        trip.route_id
                    ),

                headsign:
                    trip.trip_headsign
                    ||
                    "",

                sentido:
                    normalizarSentidoGTFS(
                        trip.direction_id
                    )
            }

        );

    }


    console.log(
        "Trips GTFS:",
        gtfsTrips.size
    );

}


// ============================================================
// CARREGAR LINHAS POR PARADA
// ============================================================

function carregarLinhasPorParada() {

    const stopTimes =
        lerGTFS(
            "stop_times.txt"
        );


    for (
        const item
        of
        stopTimes
    ) {

        const stopId =
            String(
                item.stop_id ||
                ""
            );


        const trip =
            gtfsTrips.get(
                String(
                    item.trip_id ||
                    ""
                )
            );


        if (
            !stopId
            ||
            !trip
        ) {

            continue;

        }


        const route =
            gtfsRoutes.get(
                trip.route_id
            );


        if (!route) {

            continue;

        }


        const serviceKey =
            `${
                route.route_id
            }|${
                trip.sentido
            }|${
                trip.headsign
                ||
                route.longName
            }`;


        const sequence =
            Number(
                item.stop_sequence
            );


        if (
            !servicosGTFS.has(
                serviceKey
            )
        ) {

            servicosGTFS.set(

                serviceKey,

                {
                    key:
                        serviceKey,

                    codigo:
                        route.route_id,

                    letreiro:
                        route.shortName
                        ||
                        route.route_id,

                    sentido:
                        trip.sentido,

                    destino:
                        trip.headsign
                        ||
                        route.longName
                        ||
                        "Destino não informado",

                    origem:
                        "",

                    routeLongName:
                        route.longName
                        ||
                        "",

                    stopIds:
                        new Set(),

                    sequenceByStop:
                        new Map(),

                    firstStopId:
                        null,

                    firstSequence:
                        Infinity,

                    lastStopId:
                        null,

                    lastSequence:
                        -Infinity,

                    searchText:
                        ""
                }

            );

        }


        const service =
            servicosGTFS.get(
                serviceKey
            );


        service.stopIds.add(
            stopId
        );


        if (
            Number.isFinite(
                sequence
            )
        ) {

            const atual =
                service
                    .sequenceByStop
                    .get(
                        stopId
                    );


            if (
                atual ===
                undefined
                ||
                sequence <
                atual
            ) {

                service
                    .sequenceByStop
                    .set(
                        stopId,
                        sequence
                    );

            }

        }


        if (
            Number.isFinite(
                sequence
            )
            &&
            sequence <
            service.firstSequence
        ) {

            service.firstSequence =
                sequence;


            service.firstStopId =
                stopId;

        }


        if (
            Number.isFinite(
                sequence
            )
            &&
            sequence >
            service.lastSequence
        ) {

            service.lastSequence =
                sequence;


            service.lastStopId =
                stopId;

        }


        if (
            !linhasPorParada.has(
                stopId
            )
        ) {

            linhasPorParada.set(
                stopId,
                new Set()
            );

        }


        linhasPorParada
            .get(
                stopId
            )
            .add(
                serviceKey
            );


        if (
            !sentidosPorParada.has(
                stopId
            )
        ) {

            sentidosPorParada.set(
                stopId,
                new Set()
            );

        }


        sentidosPorParada
            .get(
                stopId
            )
            .add(
                trip.sentido
            );

    }


    for (
        const service
        of
        servicosGTFS.values()
    ) {

        const primeiro =
            service.firstStopId

                ? gtfsStopPorId
                    .get(
                        service.firstStopId
                    )

                : null;


        const ultimo =
            service.lastStopId

                ? gtfsStopPorId
                    .get(
                        service.lastStopId
                    )

                : null;


        service.origem =
            primeiro?.stop_name
            ||
            "";


        if (
            !service.destino
            ||
            service.destino ===
            "Destino não informado"
        ) {

            service.destino =
                ultimo?.stop_name
                ||
                service.routeLongName
                ||
                "Destino não informado";

        }


        service.searchText =
            normalizarTexto(

                `${
                    service.letreiro
                } ${
                    service.codigo
                } ${
                    service.origem
                } ${
                    service.destino
                } ${
                    service.routeLongName
                }`

            );

    }


    console.log(
        "Paradas com linhas:",
        linhasPorParada.size
    );


    console.log(
        "Serviços indexados:",
        servicosGTFS.size
    );

}


// ============================================================
// CARREGAR GTFS COMPLETO
// ============================================================

function carregarGTFS() {

    console.log(
        "=============================="
    );


    console.log(
        "CARREGANDO GTFS..."
    );


    carregarParadasGTFS();

    carregarRotasGTFS();

    carregarTripsGTFS();

    carregarLinhasPorParada();


    console.log(
        "GTFS carregado."
    );


    console.log(
        "=============================="
    );

}


// ============================================================
// DISTÂNCIA
// ============================================================

function distanciaKm(
    lat1,
    lon1,
    lat2,
    lon2
) {

    const R =
        6371;


    const dLat =
        (
            lat2 -
            lat1
        )
        *
        Math.PI /
        180;


    const dLon =
        (
            lon2 -
            lon1
        )
        *
        Math.PI /
        180;


    const p1 =
        lat1 *
        Math.PI /
        180;


    const p2 =
        lat2 *
        Math.PI /
        180;


    const a =

        Math.sin(
            dLat / 2
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
            dLon / 2
        ) ** 2;


    return (

        R

        *

        2

        *

        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(
                1 - a
            )
        )

    );

}


// ============================================================
// LEVENSHTEIN
// ============================================================

function distanciaLevenshtein(
    a,
    b
) {

    a =
        normalizarTexto(
            a
        );


    b =
        normalizarTexto(
            b
        );


    if (
        a === b
    ) {

        return 0;

    }


    if (!a.length) {

        return b.length;

    }


    if (!b.length) {

        return a.length;

    }


    let anterior =
        Array.from(

            {
                length:
                    b.length +
                    1
            },

            (
                _,
                i
            ) =>
                i

        );


    for (
        let i = 1;
        i <= a.length;
        i++
    ) {

        const atual =
            [i];


        for (
            let j = 1;
            j <= b.length;
            j++
        ) {

            const custo =
                a[i - 1] ===
                b[j - 1]

                    ? 0

                    : 1;


            atual[j] =
                Math.min(

                    atual[j - 1] +
                    1,

                    anterior[j] +
                    1,

                    anterior[j - 1] +
                    custo

                );

        }


        anterior =
            atual;

    }


    return anterior[
        b.length
    ];

}


// ============================================================
// SIMILARIDADE
// ============================================================

function similaridade(
    a,
    b
) {

    a =
        normalizarTexto(
            a
        );


    b =
        normalizarTexto(
            b
        );


    if (
        !a ||
        !b
    ) {

        return 0;

    }


    if (
        a === b
    ) {

        return 1;

    }


    if (
        a.includes(b)
        ||
        b.includes(a)
    ) {

        return 0.95;

    }


    const maior =
        Math.max(
            a.length,
            b.length
        );


    const edicao =
        maior

            ? 1 -
                distanciaLevenshtein(
                    a,
                    b
                )
                /
                maior

            : 0;


    const palavrasA =
        new Set(

            a
                .split(" ")
                .filter(Boolean)

        );


    const palavrasB =
        new Set(

            b
                .split(" ")
                .filter(Boolean)

        );


    let comuns =
        0;


    for (
        const token
        of
        palavrasA
    ) {

        if (
            palavrasB.has(
                token
            )
        ) {

            comuns++;

        }

    }


    const scorePalavras =
        comuns /
        Math.max(
            palavrasA.size,
            palavrasB.size,
            1
        );


    return Math.max(
        edicao,
        scorePalavras
    );

}


// ============================================================
// FORMATO PÚBLICO DE LINHA
// ============================================================

function linhaPublica(
    service
) {

    return {

        codigo:
            service.codigo,

        letreiro:
            service.letreiro,

        sentido:
            service.sentido,

        destino:
            service.destino,

        origem:
            service.origem,

        quantidadeVeiculos:
            0,

        previsoes:
            []

    };

}


// ============================================================
// SENTIDO DO PONTO
// ============================================================

function sentidoDoPonto(
    stopId
) {

    const sentidos =
        sentidosPorParada.get(
            String(
                stopId
            )
        );


    if (
        !sentidos
        ||
        sentidos.size !==
        1
    ) {

        return "ambos";

    }


    return (

        [...sentidos][0] ===
        1

            ? "ida"

            : "volta"

    );

}


// ============================================================
// FORMATO PÚBLICO DO PONTO
// ============================================================

function pontoPublico(
    stop,
    distancia = null
) {

    return {

        cp:
            stop.stop_id,

        gtfsStopId:
            stop.stop_id,

        np:
            stop.stop_name
            ||
            "Ponto de ônibus",

        ed:
            stop.stop_desc
            ||
            "",

        py:
            stop.lat,

        px:
            stop.lon,

        distanciaKm:
            distancia,

        fonte:
            "GTFS",

        sentido:
            sentidoDoPonto(
                stop.stop_id
            )

    };

}


// ============================================================
// SCORE DA PESQUISA DE LINHA
// ============================================================

function scoreLinhaBusca(
    termo,
    service
) {

    const consulta =
        normalizarTexto(
            termo
        );


    const codigoConsulta =
        normalizarCodigoLinha(
            termo
        );


    const codigo =
        normalizarCodigoLinha(

            service.letreiro
            ||
            service.codigo

        );


    const destino =
        normalizarTexto(
            service.destino
        );


    const origem =
        normalizarTexto(
            service.origem
        );


    if (
        codigoConsulta
        &&
        codigo ===
        codigoConsulta
    ) {

        return 1000;

    }


    if (
        codigoConsulta
        &&
        codigo.startsWith(
            codigoConsulta
        )
    ) {

        return 930;

    }


    if (
        codigoConsulta
        &&
        codigo.includes(
            codigoConsulta
        )
    ) {

        return 870;

    }


    if (
        destino ===
        consulta
        ||
        origem ===
        consulta
    ) {

        return 820;

    }


    if (
        destino.startsWith(
            consulta
        )
        ||
        origem.startsWith(
            consulta
        )
    ) {

        return 760;

    }


    if (
        service.searchText
            .includes(
                consulta
            )
    ) {

        return 700;

    }


    const fuzzy =
        Math.max(

            similaridade(
                consulta,
                codigo
            ),

            similaridade(
                consulta,
                destino
            ),

            similaridade(
                consulta,
                origem
            ),

            similaridade(
                consulta,
                service.searchText
            )

        );


    return (

        fuzzy >=
        0.58

            ? Math.round(
                fuzzy *
                600
            )

            : 0

    );

}


// ============================================================
// SCORE DE PONTO
// ============================================================

function scorePontoBusca(
    termo,
    stop
) {

    const consulta =
        normalizarTexto(
            termo
        );


    const nome =
        normalizarTexto(
            stop.stop_name
        );


    const texto =
        stop.search_text;


    if (
        nome ===
        consulta
    ) {

        return 1000;

    }


    if (
        nome.startsWith(
            consulta
        )
    ) {

        return 900;

    }


    if (
        nome.includes(
            consulta
        )
    ) {

        return 820;

    }


    if (
        texto.includes(
            consulta
        )
    ) {

        return 760;

    }


    const fuzzy =
        Math.max(

            similaridade(
                consulta,
                nome
            ),

            similaridade(
                consulta,
                texto
            )

        );


    return (

        fuzzy >=
        0.58

            ? Math.round(
                fuzzy *
                650
            )

            : 0

    );

}


// ============================================================
// PARADA MAIS PRÓXIMA DE UMA LINHA
// ============================================================

function paradaMaisProximaDoServico(
    service,
    lat,
    lon,
    maxSequence = Infinity
) {

    let melhor =
        null;


    let melhorDistancia =
        Infinity;


    for (
        const stopId
        of
        service.stopIds
    ) {

        const sequence =
            service
                .sequenceByStop
                .get(
                    stopId
                );


        if (
            Number.isFinite(
                maxSequence
            )
            &&
            Number.isFinite(
                sequence
            )
            &&
            sequence >=
            maxSequence
        ) {

            continue;

        }


        const stop =
            gtfsStopPorId.get(
                stopId
            );


        if (!stop) {

            continue;

        }


        const distancia =
            distanciaKm(

                lat,
                lon,

                stop.lat,
                stop.lon

            );


        if (
            distancia <
            melhorDistancia
        ) {

            melhorDistancia =
                distancia;


            melhor =
                stop;

        }

    }


    if (!melhor) {

        return null;

    }


    return {

        stop:
            melhor,

        distanciaKm:
            melhorDistancia

    };

}


// ============================================================
// BUSCA ESPACIAL
// ============================================================

function buscarStopsNoRaio(
    lat,
    lon,
    raioKm
) {

    const latDeg =
        raioKm /
        111;


    const cosLat =
        Math.max(

            0.2,

            Math.cos(
                lat *
                Math.PI /
                180
            )

        );


    const lonDeg =
        raioKm /
        (
            111 *
            cosLat
        );


    const minX =
        Math.floor(
            (
                lat -
                latDeg
            )
            /
            GRID_CELL_DEG
        );


    const maxX =
        Math.floor(
            (
                lat +
                latDeg
            )
            /
            GRID_CELL_DEG
        );


    const minY =
        Math.floor(
            (
                lon -
                lonDeg
            )
            /
            GRID_CELL_DEG
        );


    const maxY =
        Math.floor(
            (
                lon +
                lonDeg
            )
            /
            GRID_CELL_DEG
        );


    const vistos =
        new Set();


    const resultado =
        [];


    for (
        let x = minX;
        x <= maxX;
        x++
    ) {

        for (
            let y = minY;
            y <= maxY;
            y++
        ) {

            const ids =
                spatialGrid.get(
                    `${x}|${y}`
                )
                ||
                [];


            for (
                const stopId
                of
                ids
            ) {

                if (
                    vistos.has(
                        stopId
                    )
                ) {

                    continue;

                }


                vistos.add(
                    stopId
                );


                const stop =
                    gtfsStopPorId.get(
                        stopId
                    );


                if (!stop) {

                    continue;

                }


                const distancia =
                    distanciaKm(

                        lat,
                        lon,

                        stop.lat,
                        stop.lon

                    );


                if (
                    distancia <=
                    raioKm
                ) {

                    resultado.push({

                        stop,

                        distanciaKm:
                            distancia

                    });

                }

            }

        }

    }


    resultado.sort(

        (
            a,
            b
        ) =>
            a.distanciaKm -
            b.distanciaKm

    );


    return resultado;

}


// ============================================================
// SPTRANS
// ============================================================

let sptransCookie =
    null;


const cacheCodigoOlhoVivo =
    new Map();


const cachePrevisao =
    new Map();


// ============================================================
// FETCH COM TIMEOUT
// ============================================================

async function fetchComTimeout(
    url,
    options = {},
    timeoutMs = 10000
) {

    const controller =
        new AbortController();


    const timer =
        setTimeout(

            () =>
                controller.abort(),

            timeoutMs

        );


    try {

        return await fetch(

            url,

            {
                ...options,

                signal:
                    controller.signal
            }

        );

    }

    finally {

        clearTimeout(
            timer
        );

    }

}


// ============================================================
// AUTENTICAR SPTRANS
// ============================================================

async function autenticarSPTrans() {

    try {

        if (
            !process.env
                .SPTRANS_TOKEN
        ) {

            console.warn(
                "SPTRANS_TOKEN não configurado."
            );


            return false;

        }


        const url =

            "https://api.olhovivo.sptrans.com.br" +

            "/v2.1/Login/Autenticar" +

            `?token=${encodeURIComponent(
                process.env.SPTRANS_TOKEN
            )}`;


        const resposta =
            await fetchComTimeout(

                url,

                {
                    method:
                        "POST",

                    headers: {
                        "Content-Length":
                            "0"
                    }
                }

            );


        const texto =
            await resposta.text();


        if (
            !resposta.ok
            ||
            texto.trim() !==
            "true"
        ) {

            return false;

        }


        const cookies =
            resposta.headers
                .get(
                    "set-cookie"
                );


        if (cookies) {

            sptransCookie =
                cookies
                    .split(";")[0];

        }


        return true;

    }

    catch (erro) {

        console.error(
            "Erro SPTrans:",
            erro.message
        );


        return false;

    }

}


// ============================================================
// FETCH SPTRANS
// ============================================================

async function fetchSPTrans(
    url
) {

    if (
        !sptransCookie
    ) {

        const ok =
            await autenticarSPTrans();


        if (!ok) {

            throw new Error(
                "Não foi possível autenticar na SPTrans."
            );

        }

    }


    let resposta =
        await fetchComTimeout(

            url,

            {
                headers: {

                    Cookie:
                        sptransCookie,

                    Accept:
                        "application/json"

                }
            }

        );


    if (
        resposta.status ===
        401
        ||
        resposta.status ===
        403
    ) {

        sptransCookie =
            null;


        const ok =
            await autenticarSPTrans();


        if (!ok) {

            throw new Error(
                "Falha ao reautenticar na SPTrans."
            );

        }


        resposta =
            await fetchComTimeout(

                url,

                {
                    headers: {

                        Cookie:
                            sptransCookie,

                        Accept:
                            "application/json"

                    }
                }

            );

    }


    return resposta;

}


// ============================================================
// PREVISÃO SEM CACHE
// ============================================================

async function buscarPrevisaoSemCache(
    codigoParada
) {

    const codigo =
        Number(
            codigoParada
        );


    if (
        !Number.isFinite(
            codigo
        )
    ) {

        return null;

    }


    const url =

        "https://api.olhovivo.sptrans.com.br" +

        "/v2.1/Previsao/Parada" +

        `?codigoParada=${codigo}`;


    const resposta =
        await fetchSPTrans(
            url
        );


    if (
        !resposta.ok
    ) {

        throw new Error(
            `SPTrans HTTP ${resposta.status}`
        );

    }


    const dados =
        await resposta.json();


    if (
        !dados?.p
    ) {

        return null;

    }


    const linhas =
        Array.isArray(
            dados.p.l
        )

            ? dados.p.l

            : [];


    const resultadoLinhas =
        linhas.map(
            linha => {

                const lista =
                    Array.isArray(
                        linha.vs
                    )

                        ? linha.vs

                        : [];


                return {

                    codigo:
                        linha.cl,

                    letreiro:
                        linha.c,

                    sentido:
                        Number(
                            linha.sl
                        )
                        ||
                        1,

                    destino:
                        linha.lt0
                        ||
                        "",

                    origem:
                        linha.lt1
                        ||
                        "",

                    quantidadeVeiculos:
                        linha.qv
                        ||
                        lista.length,

                    previsoes:
                        lista
                            .map(
                                veiculo => ({

                                    horario:
                                        veiculo.t,

                                    acessivel:
                                        veiculo.a,

                                    prefixo:
                                        veiculo.p

                                })
                            )
                            .filter(
                                item =>
                                    item.horario
                            )
                            .sort(
                                (
                                    a,
                                    b
                                ) =>
                                    String(
                                        a.horario
                                    )
                                        .localeCompare(
                                            String(
                                                b.horario
                                            )
                                        )
                            )

                };

            }
        );


    return {

        horarioConsulta:
            dados.hr
            ||
            null,

        codigoParada:
            dados.p.cp,

        nomeParada:
            dados.p.np,

        latitude:
            dados.p.py,

        longitude:
            dados.p.px,

        linhas:
            resultadoLinhas

    };

}


// ============================================================
// PREVISÃO COM CACHE
// ============================================================

async function buscarPrevisao(
    codigoParada
) {

    const chave =
        String(
            codigoParada
        );


    const atual =
        cachePrevisao.get(
            chave
        );


    const agora =
        Date.now();


    if (
        atual?.dados
        &&
        agora -
        atual.criadoEm <
        CACHE_PREVISAO_MS
    ) {

        return atual.dados;

    }


    if (
        atual?.promessa
    ) {

        return atual.promessa;

    }


    const promessa =
        buscarPrevisaoSemCache(
            codigoParada
        )
            .then(
                dados => {

                    cachePrevisao.set(

                        chave,

                        {
                            dados,

                            criadoEm:
                                Date.now(),

                            promessa:
                                null
                        }

                    );


                    return dados;

                }
            )
            .catch(
                erro => {

                    cachePrevisao.delete(
                        chave
                    );


                    throw erro;

                }
            );


    cachePrevisao.set(

        chave,

        {
            dados:
                atual?.dados
                ||
                null,

            criadoEm:
                atual?.criadoEm
                ||
                0,

            promessa
        }

    );


    return promessa;

}


// ============================================================
// DESCOBRIR CÓDIGO OLHO VIVO
// ============================================================

async function resolverCodigoOlhoVivo(
    stop
) {

    const stopId =
        String(
            stop.stop_id
        );


    if (
        cacheCodigoOlhoVivo.has(
            stopId
        )
    ) {

        return cacheCodigoOlhoVivo.get(
            stopId
        );

    }


    const nome =
        String(
            stop.stop_name
            ||
            ""
        )
            .trim();


    if (!nome) {

        cacheCodigoOlhoVivo.set(
            stopId,
            null
        );


        return null;

    }


    try {

        const url =

            "https://api.olhovivo.sptrans.com.br" +

            "/v2.1/Parada/Buscar" +

            `?termosBusca=${encodeURIComponent(
                nome
            )}`;


        const resposta =
            await fetchSPTrans(
                url
            );


        if (
            !resposta.ok
        ) {

            return null;

        }


        const dados =
            await resposta.json();


        if (
            !Array.isArray(
                dados
            )
        ) {

            return null;

        }


        const candidatos =
            dados
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

                        distancia:
                            distanciaKm(

                                stop.lat,
                                stop.lon,

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
                        a.distancia -
                        b.distancia
                );


        const melhor =
            candidatos[0];


        if (
            !melhor
            ||
            melhor.distancia >
            0.3
        ) {

            cacheCodigoOlhoVivo.set(
                stopId,
                null
            );


            return null;

        }


        const codigo =
            Number(
                melhor.cp
            );


        const resultado =
            Number.isFinite(
                codigo
            )

                ? codigo

                : null;


        cacheCodigoOlhoVivo.set(
            stopId,
            resultado
        );


        return resultado;

    }

    catch (erro) {

        console.warn(
            "Erro ao resolver parada:",
            erro.message
        );


        return null;

    }

}


// ============================================================
// LINHAS GTFS DE UMA PARADA
// ============================================================

function pegarLinhasGTFS(
    stopId
) {

    const keys =
        linhasPorParada.get(
            String(
                stopId
            )
        );


    if (!keys) {

        return [];

    }


    return [...keys]
        .map(
            key =>
                servicosGTFS.get(
                    key
                )
        )
        .filter(Boolean)
        .map(
            linhaPublica
        )
        .sort(
            (
                a,
                b
            ) =>
                String(
                    a.letreiro
                )
                    .localeCompare(
                        String(
                            b.letreiro
                        ),
                        "pt-BR"
                    )
        );

}


// ============================================================
// API - PARADAS PRÓXIMAS
// ============================================================

app.get(

    "/api/paradas",

    (
        req,
        res
    ) => {

        const lat =
            Number(
                req.query.lat
            );


        const lon =
            Number(
                req.query.lon
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

            return res
                .status(400)
                .json({
                    erro:
                        "Latitude e longitude inválidas."
                });

        }


        let raio =
            Number(
                req.query.raio
            );


        if (
            !Number.isFinite(
                raio
            )
        ) {

            raio =
                RAIO_PADRAO_KM;

        }


        raio =
            Math.max(

                0.1,

                Math.min(
                    raio,
                    RAIO_MAXIMO_MAPA_KM
                )

            );


        const paradas =
            buscarStopsNoRaio(
                lat,
                lon,
                raio
            )
                .map(
                    ({
                        stop,
                        distanciaKm
                    }) =>
                        pontoPublico(
                            stop,
                            distanciaKm
                        )
                );


        return res.json(
            paradas
        );

    }

);


// ============================================================
// API - PESQUISA GLOBAL DE LINHAS
// ============================================================

app.get(

    "/api/busca-linhas",

    (
        req,
        res
    ) => {

        const termo =
            String(
                req.query.termo
                ||
                ""
            )
                .trim();


        if (
            termo.length <
            2
        ) {

            return res
                .status(400)
                .json({
                    erro:
                        "Digite pelo menos 2 caracteres."
                });

        }


        const lat =
            Number(
                req.query.lat
            );


        const lon =
            Number(
                req.query.lon
            );


        const temLocalizacao =

            Number.isFinite(
                lat
            )

            &&

            Number.isFinite(
                lon
            );


        const resultados =
            [];


        for (
            const service
            of
            servicosGTFS.values()
        ) {

            const score =
                scoreLinhaBusca(
                    termo,
                    service
                );


            if (!score) {

                continue;

            }


            let ponto =
                null;


            let distanciaEmbarque =
                Infinity;


            if (
                temLocalizacao
            ) {

                const nearest =
                    paradaMaisProximaDoServico(

                        service,

                        lat,
                        lon

                    );


                if (
                    nearest
                ) {

                    ponto =
                        pontoPublico(

                            nearest.stop,

                            nearest.distanciaKm

                        );


                    distanciaEmbarque =
                        nearest.distanciaKm *
                        1000;

                }

            }

            else {

                const primeiroId =

                    service.firstStopId

                    ||

                    [...service.stopIds][0];


                const stop =
                    primeiroId

                        ? gtfsStopPorId
                            .get(
                                primeiroId
                            )

                        : null;


                if (stop) {

                    ponto =
                        pontoPublico(
                            stop
                        );

                }

            }


            resultados.push({

                linha:
                    linhaPublica(
                        service
                    ),

                ponto,

                distanciaEmbarque,

                score

            });

        }


        resultados.sort(

            (
                a,
                b
            ) =>

                b.score -
                a.score

                ||

                a.distanciaEmbarque -
                b.distanciaEmbarque

        );


        /*
         * NÃO existe slice(0, 10).
         *
         * Retorna todos os resultados.
         */

        return res.json(
            resultados
        );

    }

);


// ============================================================
// API - PESQUISA GLOBAL DE PONTOS
// ============================================================

app.get(

    "/api/busca-pontos",

    (
        req,
        res
    ) => {

        const termo =
            String(
                req.query.termo
                ||
                ""
            )
                .trim();


        if (
            termo.length <
            2
        ) {

            return res
                .status(400)
                .json({
                    erro:
                        "Digite pelo menos 2 caracteres."
                });

        }


        const lat =
            Number(
                req.query.lat
            );


        const lon =
            Number(
                req.query.lon
            );


        const temLocalizacao =

            Number.isFinite(
                lat
            )

            &&

            Number.isFinite(
                lon
            );


        const resultados =
            [];


        for (
            const stop
            of
            gtfsStops
        ) {

            const score =
                scorePontoBusca(
                    termo,
                    stop
                );


            if (!score) {

                continue;

            }


            const distancia =

                temLocalizacao

                    ? distanciaKm(

                        lat,
                        lon,

                        stop.lat,
                        stop.lon

                    )

                    : Infinity;


            resultados.push({

                ponto:
                    pontoPublico(

                        stop,

                        Number.isFinite(
                            distancia
                        )

                            ? distancia

                            : null

                    ),

                score,

                distancia:
                    Number.isFinite(
                        distancia
                    )

                        ? distancia *
                            1000

                        : Infinity

            });

        }


        resultados.sort(

            (
                a,
                b
            ) =>

                b.score -
                a.score

                ||

                a.distancia -
                b.distancia

        );


        return res.json(
            resultados
        );

    }

);


// ============================================================
// API - BUSCA RÁPIDA DE ROTAS DE ÔNIBUS
// ============================================================

app.get(

    "/api/busca-rotas",

    (
        req,
        res
    ) => {

        const origemLat =
            Number(
                req.query.origemLat
            );


        const origemLon =
            Number(
                req.query.origemLon
            );


        const destinoLat =
            Number(
                req.query.destinoLat
            );


        const destinoLon =
            Number(
                req.query.destinoLon
            );


        const raioDestinoM =
            Math.max(

                100,

                Math.min(

                    Number(
                        req.query.raioDestinoM
                        ||
                        1200
                    ),

                    5000

                )

            );


        if (
            ![
                origemLat,
                origemLon,
                destinoLat,
                destinoLon
            ]
                .every(
                    Number.isFinite
                )
        ) {

            return res
                .status(400)
                .json({
                    erro:
                        "Coordenadas inválidas."
                });

        }


        const paradasDestino =
            buscarStopsNoRaio(

                destinoLat,
                destinoLon,

                raioDestinoM /
                1000

            );


        const candidatos =
            new Map();


        for (
            const {
                stop: stopDestino,
                distanciaKm: distanciaDestinoKm
            }
            of
            paradasDestino
        ) {

            const services =
                linhasPorParada.get(
                    stopDestino.stop_id
                );


            if (!services) {

                continue;

            }


            for (
                const serviceKey
                of
                services
            ) {

                const service =
                    servicosGTFS.get(
                        serviceKey
                    );


                if (!service) {

                    continue;

                }


                const destinoSequence =
                    service
                        .sequenceByStop
                        .get(
                            stopDestino.stop_id
                        );


                /*
                 * Só escolhe ponto de embarque
                 * antes do ponto de destino
                 * na sequência da viagem.
                 */

                const embarque =
                    paradaMaisProximaDoServico(

                        service,

                        origemLat,
                        origemLon,

                        Number.isFinite(
                            destinoSequence
                        )

                            ? destinoSequence

                            : Infinity

                    );


                if (!embarque) {

                    continue;

                }


                const distanciaEmbarqueM =
                    embarque.distanciaKm *
                    1000;


                const distanciaDestinoM =
                    distanciaDestinoKm *
                    1000;


                const score =

                    distanciaEmbarqueM

                    +

                    distanciaDestinoM;


                const atual =
                    candidatos.get(
                        serviceKey
                    );


                if (
                    !atual
                    ||
                    score <
                    atual.score
                ) {

                    candidatos.set(

                        serviceKey,

                        {
                            linha:
                                linhaPublica(
                                    service
                                ),

                            ponto:
                                pontoPublico(

                                    embarque.stop,

                                    embarque.distanciaKm

                                ),

                            pontoDestino:
                                pontoPublico(

                                    stopDestino,

                                    distanciaDestinoKm

                                ),

                            distanciaEmbarque:
                                distanciaEmbarqueM,

                            distanciaDestino:
                                distanciaDestinoM,

                            score
                        }

                    );

                }

            }

        }


        const resultados =
            [
                ...candidatos.values()
            ]
                .sort(
                    (
                        a,
                        b
                    ) =>
                        a.score -
                        b.score
                );


        return res.json(
            resultados
        );

    }

);


// ============================================================
// API - LINHAS DE UM PONTO
// ============================================================

app.get(

    "/api/paradas/:stopId/linhas",

    async (
        req,
        res,
        next
    ) => {

        try {

            const stopId =
                String(
                    req.params.stopId
                );


            const stop =
                gtfsStopPorId.get(
                    stopId
                );


            if (!stop) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Parada não encontrada no GTFS."
                    });

            }


            /*
             * TENTATIVA 1:
             *
             * usar stop_id diretamente.
             */

            const codigoDireto =
                Number(
                    stopId
                );


            if (
                Number.isFinite(
                    codigoDireto
                )
            ) {

                try {

                    const previsao =
                        await buscarPrevisao(
                            codigoDireto
                        );


                    if (
                        previsao
                            ?.linhas
                            ?.length
                    ) {

                        return res.json({

                            ponto: {

                                codigo:
                                    stop.stop_id,

                                codigoOlhoVivo:
                                    previsao.codigoParada,

                                nome:
                                    stop.stop_name,

                                latitude:
                                    stop.lat,

                                longitude:
                                    stop.lon

                            },

                            horarioConsulta:
                                previsao.horarioConsulta,

                            fonte:
                                "Olho Vivo",

                            tempoReal:
                                true,

                            linhas:
                                previsao.linhas

                        });

                    }

                }

                catch (erro) {

                    console.warn(
                        "Previsão direta:",
                        erro.message
                    );

                }

            }


            /*
             * TENTATIVA 2:
             *
             * encontrar código pela localização.
             */

            const codigoEncontrado =
                await resolverCodigoOlhoVivo(
                    stop
                );


            if (
                codigoEncontrado
                &&
                codigoEncontrado !==
                codigoDireto
            ) {

                try {

                    const previsao =
                        await buscarPrevisao(
                            codigoEncontrado
                        );


                    if (
                        previsao
                            ?.linhas
                            ?.length
                    ) {

                        return res.json({

                            ponto: {

                                codigo:
                                    stop.stop_id,

                                codigoOlhoVivo:
                                    codigoEncontrado,

                                nome:
                                    stop.stop_name,

                                latitude:
                                    stop.lat,

                                longitude:
                                    stop.lon

                            },

                            horarioConsulta:
                                previsao.horarioConsulta,

                            fonte:
                                "Olho Vivo",

                            tempoReal:
                                true,

                            linhas:
                                previsao.linhas

                        });

                    }

                }

                catch (erro) {

                    console.warn(
                        "Previsão alternativa:",
                        erro.message
                    );

                }

            }


            /*
             * FALLBACK:
             *
             * responde GTFS mesmo se
             * SPTrans falhar.
             */

            return res.json({

                ponto: {

                    codigo:
                        stop.stop_id,

                    codigoOlhoVivo:
                        null,

                    nome:
                        stop.stop_name,

                    latitude:
                        stop.lat,

                    longitude:
                        stop.lon

                },

                horarioConsulta:
                    null,

                fonte:
                    "GTFS",

                tempoReal:
                    false,

                linhas:
                    pegarLinhasGTFS(
                        stopId
                    )

            });

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


// ============================================================
// VALHALLA / ROTA A PÉ
// ============================================================

const cacheRotas =
    new Map();


function decodificarPolyline6(
    encoded
) {

    const coordenadas =
        [];


    let index =
        0;


    let lat =
        0;


    let lon =
        0;


    while (
        index <
        encoded.length
    ) {

        let shift =
            0;


        let result =
            0;


        let byte;


        do {

            byte =
                encoded.charCodeAt(
                    index++
                )
                -
                63;


            result |=
                (
                    byte &
                    0x1f
                )
                <<
                shift;


            shift +=
                5;

        }

        while (
            byte >=
            0x20
        );


        lat +=

            result &
            1

                ? ~(
                    result >>
                    1
                )

                : result >>
                1;


        shift =
            0;


        result =
            0;


        do {

            byte =
                encoded.charCodeAt(
                    index++
                )
                -
                63;


            result |=
                (
                    byte &
                    0x1f
                )
                <<
                shift;


            shift +=
                5;

        }

        while (
            byte >=
            0x20
        );


        lon +=

            result &
            1

                ? ~(
                    result >>
                    1
                )

                : result >>
                1;


        coordenadas.push([
            lat / 1e6,
            lon / 1e6
        ]);

    }


    return coordenadas;

}


app.get(

    "/api/rota-pedestre",

    async (
        req,
        res,
        next
    ) => {

        try {

            const origemLat =
                Number(
                    req.query.origemLat
                );


            const origemLon =
                Number(
                    req.query.origemLon
                );


            const destinoLat =
                Number(
                    req.query.destinoLat
                );


            const destinoLon =
                Number(
                    req.query.destinoLon
                );


            if (
                ![
                    origemLat,
                    origemLon,
                    destinoLat,
                    destinoLon
                ]
                    .every(
                        Number.isFinite
                    )
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Coordenadas inválidas."
                    });

            }


            /*
             * Arredondamento melhora o cache.
             */

            const chave =
                [
                    origemLat,
                    origemLon,
                    destinoLat,
                    destinoLon
                ]
                    .map(
                        valor =>
                            Number(
                                valor
                            )
                                .toFixed(4)
                    )
                    .join("|");


            const cached =
                cacheRotas.get(
                    chave
                );


            if (
                cached
                &&
                Date.now() -
                cached.criadoEm <
                CACHE_ROTA_MS
            ) {

                return res.json(
                    cached.dados
                );

            }


            const pedido = {

                locations: [

                    {
                        lat:
                            origemLat,

                        lon:
                            origemLon
                    },

                    {
                        lat:
                            destinoLat,

                        lon:
                            destinoLon
                    }

                ],

                costing:
                    "pedestrian",

                units:
                    "kilometers",

                language:
                    "pt-BR",

                directions_type:
                    "instructions"

            };


            const resposta =
                await fetchComTimeout(

                    `${VALHALLA_URL}?json=${encodeURIComponent(
                        JSON.stringify(
                            pedido
                        )
                    )}`,

                    {},

                    12000

                );


            if (
                !resposta.ok
            ) {

                throw new Error(
                    `Valhalla HTTP ${resposta.status}`
                );

            }


            const dados =
                await resposta.json();


            const trip =
                dados?.trip;


            const legs =
                Array.isArray(
                    trip?.legs
                )

                    ? trip.legs

                    : [];


            if (
                !legs.length
            ) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Rota pedestre não encontrada."
                    });

            }


            const coordenadas =
                [];


            const instrucoes =
                [];


            for (
                const leg
                of
                legs
            ) {

                if (
                    leg.shape
                ) {

                    const coords =
                        decodificarPolyline6(
                            String(
                                leg.shape
                            )
                        );


                    if (
                        coordenadas.length
                        &&
                        coords.length
                    ) {

                        coords.shift();

                    }


                    coordenadas.push(
                        ...coords
                    );

                }


                const manobras =
                    Array.isArray(
                        leg.maneuvers
                    )

                        ? leg.maneuvers

                        : [];


                for (
                    const manobra
                    of
                    manobras
                ) {

                    instrucoes.push({

                        texto:
                            manobra.instruction
                            ||
                            manobra
                                .verbal_pre_transition_instruction
                            ||
                            "",

                        distanciaM:
                            Number.isFinite(
                                Number(
                                    manobra.length
                                )
                            )

                                ? Number(
                                    manobra.length
                                ) *
                                1000

                                : null,

                        tempoS:
                            Number.isFinite(
                                Number(
                                    manobra.time
                                )
                            )

                                ? Number(
                                    manobra.time
                                )

                                : null

                    });

                }

            }


            const respostaFinal = {

                coordenadas,

                distanciaMetros:
                    Number.isFinite(
                        Number(
                            trip
                                ?.summary
                                ?.length
                        )
                    )

                        ? Number(
                            trip.summary.length
                        )
                        *
                        1000

                        : null,

                duracaoSegundos:
                    Number.isFinite(
                        Number(
                            trip
                                ?.summary
                                ?.time
                        )
                    )

                        ? Number(
                            trip.summary.time
                        )

                        : null,

                instrucoes

            };


            cacheRotas.set(

                chave,

                {
                    criadoEm:
                        Date.now(),

                    dados:
                        respostaFinal
                }

            );


            return res.json(
                respostaFinal
            );

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


// ============================================================
// FOTOS DAS AVALIAÇÕES
// ============================================================

function salvarFotosDataUrl(
    reviewId,
    fotos
) {

    const lista =
        Array.isArray(
            fotos
        )

            ? fotos.slice(
                0,
                4
            )

            : [];


    const urls =
        [];


    for (
        let i = 0;
        i < lista.length;
        i++
    ) {

        const dataUrl =
            String(
                lista[i] ||
                ""
            );


        const match =
            dataUrl.match(

                /^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i

            );


        if (!match) {

            continue;

        }


        const ext =

            match[1]
                .toLowerCase() ===
            "jpeg"

                ? "jpg"

                : match[1]
                    .toLowerCase();


        const buffer =
            Buffer.from(
                match[2],
                "base64"
            );


        if (
            !buffer.length
            ||
            buffer.length >
            8 *
            1024 *
            1024
        ) {

            continue;

        }


        const nome =

            `${reviewId}-${i}-${
                crypto
                    .randomBytes(4)
                    .toString("hex")
            }.${ext}`;


        fs.writeFileSync(

            path.join(
                REVIEW_UPLOAD_DIR,
                nome
            ),

            buffer

        );


        urls.push(
            `/uploads/reviews/${nome}`
        );

    }


    return urls;

}


// ============================================================
// CONVERTER REVIEW
// ============================================================

function reviewPublico(
    row
) {

    let fotos =
        [];


    try {

        fotos =
            JSON.parse(
                row.photos_json
                ||
                "[]"
            );

    }

    catch {}


    return {

        id:
            row.id,

        autor:
            row.user_id,

        autor_nome:
            row.user_name
            ||
            "Usuário",

        autor_foto:
            row.user_picture
            ||
            "",

        linha:
            row.line_key,

        numero:
            row.line_number
            ||
            "",

        destino:
            row.destination
            ||
            "",

        ponto:
            row.stop_name
            ||
            "",

        prefixo:
            row.vehicle_prefix
            ||
            "",

        nota:
            row.rating,

        comentario:
            row.comment
            ||
            "",

        lotacao:
            row.crowding
            ||
            "",

        atraso:
            row.delay
            ||
            "",

        fotos,

        criado_em:
            row.created_at

    };

}


// ============================================================
// API - AVALIAÇÕES
// ============================================================

app.get(

    "/api/avaliacoes",

    authOptional,

    (
        req,
        res
    ) => {

        const linha =
            String(
                req.query.linha
                ||
                ""
            )
                .trim();


        const querMinhas =
            req.query.autor !==
            undefined;


        if (
            querMinhas
        ) {

            if (
                !req.auth
            ) {

                return res
                    .status(401)
                    .json({
                        erro:
                            "Login necessário."
                    });

            }


            return res.json(

                sql.reviewsByUser
                    .all(
                        req.auth.id
                    )
                    .map(
                        reviewPublico
                    )

            );

        }


        if (!linha) {

            return res
                .status(400)
                .json({
                    erro:
                        "Informe a linha."
                });

        }


        return res.json(

            sql.reviewsByLine
                .all(
                    linha
                )
                .map(
                    reviewPublico
                )

        );

    }

);


app.post(

    "/api/avaliacoes",

    requireAuth,

    (
        req,
        res,
        next
    ) => {

        try {

            const rating =
                Number(
                    req.body?.nota
                );


            if (
                !Number.isInteger(
                    rating
                )
                ||
                rating < 1
                ||
                rating > 5
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Nota deve estar entre 1 e 5."
                    });

            }


            const lineKey =
                String(
                    req.body?.linha
                    ||
                    ""
                )
                    .trim();


            if (!lineKey) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Linha obrigatória."
                    });

            }


            const id =
                String(
                    req.body?.id
                    ||
                    crypto.randomUUID()
                );


            const fotos =
                salvarFotosDataUrl(

                    id,

                    req.body?.fotos

                );


            const createdAt =
                new Date()
                    .toISOString();


            sql.reviewInsert.run({

                id,

                user_id:
                    req.auth.id,

                line_key:
                    lineKey,

                line_number:
                    String(
                        req.body?.numero
                        ||
                        ""
                    )
                        .slice(
                            0,
                            80
                        ),

                destination:
                    String(
                        req.body?.destino
                        ||
                        ""
                    )
                        .slice(
                            0,
                            200
                        ),

                stop_name:
                    String(
                        req.body?.ponto
                        ||
                        ""
                    )
                        .slice(
                            0,
                            250
                        ),

                vehicle_prefix:
                    String(
                        req.body?.prefixo
                        ||
                        ""
                    )
                        .slice(
                            0,
                            50
                        ),

                rating,

                comment:
                    String(
                        req.body?.comentario
                        ||
                        ""
                    )
                        .slice(
                            0,
                            1500
                        ),

                crowding:
                    String(
                        req.body?.lotacao
                        ||
                        ""
                    )
                        .slice(
                            0,
                            80
                        ),

                delay:
                    String(
                        req.body?.atraso
                        ||
                        ""
                    )
                        .slice(
                            0,
                            80
                        ),

                photos_json:
                    JSON.stringify(
                        fotos
                    ),

                created_at:
                    createdAt

            });


            return res
                .status(201)
                .json({

                    ok:
                        true,

                    id,

                    fotos,

                    criado_em:
                        createdAt

                });

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


app.delete(

    "/api/avaliacoes/:id",

    requireAuth,

    (
        req,
        res
    ) => {

        const info =
            sql.reviewDeleteOwned
                .run(

                    String(
                        req.params.id
                    ),

                    req.auth.id

                );


        if (
            !info.changes
        ) {

            return res
                .status(404)
                .json({
                    erro:
                        "Avaliação não encontrada."
                });

        }


        res
            .status(204)
            .end();

    }

);


// ============================================================
// API - FLASH
// ============================================================

app.get(

    "/api/flash",

    (
        req,
        res
    ) => {

        const linha =
            String(
                req.query.linha
                ||
                ""
            )
                .trim();


        if (!linha) {

            return res
                .status(400)
                .json({
                    erro:
                        "Informe a linha."
                });

        }


        const agora =
            new Date()
                .toISOString();


        sql.flashDeleteExpired.run(
            agora
        );


        const rows =
            sql.flashesByLine
                .all(
                    linha,
                    agora
                );


        return res.json(

            rows.map(
                row => ({

                    id:
                        row.id,

                    autor:
                        row.user_id,

                    autor_nome:
                        row.user_name
                        ||
                        "Usuário",

                    autor_foto:
                        row.user_picture
                        ||
                        "",

                    linha:
                        row.line_key,

                    numero:
                        row.line_number
                        ||
                        "",

                    destino:
                        row.destination
                        ||
                        "",

                    ponto:
                        row.stop_name
                        ||
                        "",

                    texto:
                        row.text,

                    criado_em:
                        row.created_at,

                    expira_em:
                        row.expires_at

                })
            )

        );

    }

);


app.post(

    "/api/flash",

    requireAuth,

    (
        req,
        res,
        next
    ) => {

        try {

            const texto =
                String(
                    req.body?.texto
                    ||
                    ""
                )
                    .trim();


            const linha =
                String(
                    req.body?.linha
                    ||
                    ""
                )
                    .trim();


            if (
                !texto
                ||
                !linha
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Linha e texto são obrigatórios."
                    });

            }


            const criadoEm =
                new Date()
                    .toISOString();


            let expiraEm =
                new Date(
                    req.body?.expira_em
                    ||
                    0
                );


            if (
                !Number.isFinite(
                    expiraEm.getTime()
                )
                ||
                expiraEm <=
                new Date()
            ) {

                expiraEm =
                    new Date(

                        Date.now()

                        +

                        5 *
                        60 *
                        60 *
                        1000

                    );

            }


            const id =
                String(
                    req.body?.id
                    ||
                    crypto.randomUUID()
                );


            sql.flashInsert.run({

                id,

                user_id:
                    req.auth.id,

                line_key:
                    linha,

                line_number:
                    String(
                        req.body?.numero
                        ||
                        ""
                    )
                        .slice(
                            0,
                            80
                        ),

                destination:
                    String(
                        req.body?.destino
                        ||
                        ""
                    )
                        .slice(
                            0,
                            200
                        ),

                stop_name:
                    String(
                        req.body?.ponto
                        ||
                        ""
                    )
                        .slice(
                            0,
                            250
                        ),

                text:
                    texto.slice(
                        0,
                        280
                    ),

                created_at:
                    criadoEm,

                expires_at:
                    expiraEm
                        .toISOString()

            });


            return res
                .status(201)
                .json({

                    ok:
                        true,

                    id,

                    criado_em:
                        criadoEm,

                    expira_em:
                        expiraEm
                            .toISOString()

                });

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


// ============================================================
// LIMPEZA AUTOMÁTICA DO FLASH
// ============================================================

setInterval(

    () => {

        try {

            sql.flashDeleteExpired.run(
                new Date()
                    .toISOString()
            );

        }

        catch {}

    },

    60 *
    60 *
    1000

).unref();


// ============================================================
// LUGARES SALVOS
// ============================================================

function lugarPublico(
    row
) {

    return {

        id:
            row.id,

        autor:
            row.user_id,

        nome:
            row.name,

        endereco:
            row.address
            ||
            "",

        icone:
            row.icon
            ||
            "📍",

        lat:
            row.lat,

        lon:
            row.lon,

        criado_em:
            row.created_at,

        atualizado_em:
            row.updated_at

    };

}


app.get(

    "/api/lugares",

    requireAuth,

    (
        req,
        res
    ) => {

        return res.json(

            sql.placesByUser
                .all(
                    req.auth.id
                )
                .map(
                    lugarPublico
                )

        );

    }

);


app.post(

    "/api/lugares",

    requireAuth,

    (
        req,
        res,
        next
    ) => {

        try {

            const nome =
                String(
                    req.body?.nome
                    ||
                    ""
                )
                    .trim();


            const lat =
                Number(
                    req.body?.lat
                );


            const lon =
                Number(
                    req.body?.lon
                );


            if (
                !nome
                ||
                !Number.isFinite(
                    lat
                )
                ||
                !Number.isFinite(
                    lon
                )
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Nome, latitude e longitude são obrigatórios."
                    });

            }


            const agora =
                new Date()
                    .toISOString();


            const id =
                String(
                    req.body?.id
                    ||
                    crypto.randomUUID()
                );


            sql.placeInsert.run({

                id,

                user_id:
                    req.auth.id,

                name:
                    nome.slice(
                        0,
                        120
                    ),

                address:
                    String(
                        req.body?.endereco
                        ||
                        ""
                    )
                        .slice(
                            0,
                            300
                        ),

                icon:
                    String(
                        req.body?.icone
                        ||
                        "📍"
                    )
                        .slice(
                            0,
                            20
                        ),

                lat,

                lon,

                created_at:
                    agora,

                updated_at:
                    agora

            });


            return res
                .status(201)
                .json(

                    lugarPublico(

                        sql.placeByIdOwned
                            .get(
                                id,
                                req.auth.id
                            )

                    )

                );

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


app.put(

    "/api/lugares/:id",

    requireAuth,

    (
        req,
        res,
        next
    ) => {

        try {

            const id =
                String(
                    req.params.id
                );


            const nome =
                String(
                    req.body?.nome
                    ||
                    ""
                )
                    .trim();


            const lat =
                Number(
                    req.body?.lat
                );


            const lon =
                Number(
                    req.body?.lon
                );


            if (
                !nome
                ||
                !Number.isFinite(
                    lat
                )
                ||
                !Number.isFinite(
                    lon
                )
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Nome, latitude e longitude são obrigatórios."
                    });

            }


            const info =
                sql.placeUpdateOwned
                    .run({

                        id,

                        user_id:
                            req.auth.id,

                        name:
                            nome.slice(
                                0,
                                120
                            ),

                        address:
                            String(
                                req.body?.endereco
                                ||
                                ""
                            )
                                .slice(
                                    0,
                                    300
                                ),

                        icon:
                            String(
                                req.body?.icone
                                ||
                                "📍"
                            )
                                .slice(
                                    0,
                                    20
                                ),

                        lat,

                        lon,

                        updated_at:
                            new Date()
                                .toISOString()

                    });


            if (
                !info.changes
            ) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Lugar não encontrado."
                    });

            }


            return res.json(

                lugarPublico(

                    sql.placeByIdOwned
                        .get(
                            id,
                            req.auth.id
                        )

                )

            );

        }

        catch (erro) {

            next(
                erro
            );

        }

    }

);


app.delete(

    "/api/lugares/:id",

    requireAuth,

    (
        req,
        res
    ) => {

        const info =
            sql.placeDeleteOwned
                .run(

                    String(
                        req.params.id
                    ),

                    req.auth.id

                );


        if (
            !info.changes
        ) {

            return res
                .status(404)
                .json({
                    erro:
                        "Lugar não encontrado."
                });

        }


        return res
            .status(204)
            .end();

    }

);


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(

    "/api/health",

    (
        req,
        res
    ) => {

        return res.json({

            ok:
                true,

            gtfs: {

                paradas:
                    gtfsStops.length,

                rotas:
                    gtfsRoutes.size,

                viagens:
                    gtfsTrips.size,

                servicos:
                    servicosGTFS.size

            },

            banco:
                DB_PATH,

            sptransConfigurado:
                Boolean(
                    process.env.SPTRANS_TOKEN
                ),

            googleConfigurado:
                Boolean(
                    GOOGLE_CLIENT_ID
                )

        });

    }

);


// ============================================================
// API 404
// ============================================================

app.use(

    "/api",

    (
        req,
        res
    ) => {

        return res
            .status(404)
            .json({
                erro:
                    "Rota de API não encontrada."
            });

    }

);


// ============================================================
// ERROR HANDLER
// ============================================================

app.use(

    (
        erro,
        req,
        res,
        next
    ) => {

        console.error(
            "ERRO:",
            erro
        );


        if (
            erro?.name ===
            "AbortError"
        ) {

            return res
                .status(504)
                .json({
                    erro:
                        "Tempo limite excedido."
                });

        }


        if (
            String(
                erro?.code
                ||
                ""
            )
                .startsWith(
                    "SQLITE_CONSTRAINT"
                )
        ) {

            return res
                .status(409)
                .json({
                    erro:
                        "Registro duplicado ou inválido."
                });

        }


        return res
            .status(500)
            .json({
                erro:
                    "Erro interno do servidor."
            });

    }

);


// ============================================================
// CARREGAR GTFS
// ============================================================

try {

    carregarGTFS();

}

catch (erro) {

    console.error(
        "ERRO FATAL NO GTFS:",
        erro
    );


    process.exit(
        1
    );

}


// ============================================================
// START
// ============================================================

const server =
    app.listen(

        PORT,

        async () => {

            console.log(
                `BusReview rodando na porta ${PORT}`
            );


            console.log(
                `Banco SQLite: ${DB_PATH}`
            );


            console.log(
                `Paradas: ${gtfsStops.length}`
            );


            console.log(
                `Serviços: ${servicosGTFS.size}`
            );


            if (
                process.env.SPTRANS_TOKEN
            ) {

                await autenticarSPTrans();

            }

        }

    );


// ============================================================
// ENCERRAR CORRETAMENTE
// ============================================================

function encerrar() {

    console.log(
        "Encerrando BusReview..."
    );


    server.close(
        () => {

            try {

                db.close();

            }

            catch {}


            process.exit(
                0
            );

        }
    );


    setTimeout(

        () =>
            process.exit(
                1
            ),

        5000

    ).unref();

}


process.on(
    "SIGINT",
    encerrar
);


process.on(
    "SIGTERM",
    encerrar
);
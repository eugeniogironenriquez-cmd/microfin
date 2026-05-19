-- ============================================================
-- CATÁLOGO DE ESTADOS Y MUNICIPIOS DE MÉXICO
-- ============================================================

CREATE TABLE IF NOT EXISTS estados (
  id       SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clave     VARCHAR(5)  NOT NULL,
  nombre   VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_estado_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS municipios (
  id       SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  estado_id SMALLINT UNSIGNED NOT NULL,
  nombre   VARCHAR(150) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_mun_estado (estado_id),
  CONSTRAINT fk_mun_estado FOREIGN KEY (estado_id) REFERENCES estados(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ESTADOS ──────────────────────────────────────────────────
INSERT INTO estados (clave, nombre) VALUES
('AGS','Aguascalientes'),('BC','Baja California'),('BCS','Baja California Sur'),
('CAMP','Campeche'),('CHIS','Chiapas'),('CHIH','Chihuahua'),
('CDMX','Ciudad de México'),('COAH','Coahuila'),('COL','Colima'),
('DGO','Durango'),('GTO','Guanajuato'),('GRO','Guerrero'),
('HGO','Hidalgo'),('JAL','Jalisco'),('MEX','Estado de México'),
('MICH','Michoacán'),('MOR','Morelos'),('NAY','Nayarit'),
('NL','Nuevo León'),('OAX','Oaxaca'),('PUE','Puebla'),
('QRO','Querétaro'),('QROO','Quintana Roo'),('SLP','San Luis Potosí'),
('SIN','Sinaloa'),('SON','Sonora'),('TAB','Tabasco'),
('TAMS','Tamaulipas'),('TLAX','Tlaxcala'),('VER','Veracruz'),
('YUC','Yucatán'),('ZAC','Zacatecas');

-- ── MUNICIPIOS POR ESTADO ────────────────────────────────────

-- Aguascalientes (1)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Aguascalientes' m UNION SELECT 'Asientos' UNION SELECT 'Calvillo' UNION
  SELECT 'Cosío' UNION SELECT 'Jesús María' UNION SELECT 'Pabellón de Arteaga' UNION
  SELECT 'Rincón de Romos' UNION SELECT 'San José de Gracia' UNION SELECT 'Tepezalá' UNION
  SELECT 'El Llano' UNION SELECT 'San Francisco de los Romo'
) t WHERE s.clave='AGS';

-- Baja California (2)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Ensenada' m UNION SELECT 'Mexicali' UNION SELECT 'Tecate' UNION
  SELECT 'Tijuana' UNION SELECT 'Playas de Rosarito' UNION SELECT 'San Quintín' UNION
  SELECT 'San Felipe'
) t WHERE s.clave='BC';

-- Baja California Sur (3)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Comondú' m UNION SELECT 'Mulegé' UNION SELECT 'La Paz' UNION
  SELECT 'Los Cabos' UNION SELECT 'Loreto'
) t WHERE s.clave='BCS';

-- Campeche (4)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Calkiní' m UNION SELECT 'Campeche' UNION SELECT 'Carmen' UNION
  SELECT 'Champotón' UNION SELECT 'Hecelchakán' UNION SELECT 'Hopelchén' UNION
  SELECT 'Palizada' UNION SELECT 'Tenabo' UNION SELECT 'Escárcega' UNION
  SELECT 'Calakmul' UNION SELECT 'Candelaria'
) t WHERE s.clave='CAMP';

-- Chiapas (5)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Tuxtla Gutiérrez' m UNION SELECT 'San Cristóbal de las Casas' UNION
  SELECT 'Tapachula' UNION SELECT 'Comitán de Domínguez' UNION SELECT 'Ocosingo' UNION
  SELECT 'Palenque' UNION SELECT 'Tonalá' UNION SELECT 'Arriaga' UNION
  SELECT 'Chiapa de Corzo' UNION SELECT 'Huixtla' UNION SELECT 'Pichucalco' UNION
  SELECT 'Villaflores' UNION SELECT 'Acala' UNION SELECT 'Berriozábal' UNION
  SELECT 'Cintalapa' UNION SELECT 'Ixtapa' UNION SELECT 'Jiquipilas' UNION
  SELECT 'Mapastepec' UNION SELECT 'Motozintla' UNION SELECT 'Pijijiapan' UNION
  SELECT 'Reforma' UNION SELECT 'Suchiate' UNION SELECT 'Venustiano Carranza'
) t WHERE s.clave='CHIS';

-- Chihuahua (6)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Chihuahua' m UNION SELECT 'Ciudad Juárez' UNION SELECT 'Delicias' UNION
  SELECT 'Cuauhtémoc' UNION SELECT 'Hidalgo del Parral' UNION SELECT 'Ojinaga' UNION
  SELECT 'Camargo' UNION SELECT 'Jiménez' UNION SELECT 'Casas Grandes' UNION
  SELECT 'Guerrero' UNION SELECT 'Bocoyna' UNION SELECT 'Madera' UNION
  SELECT 'Namiquipa' UNION SELECT 'Guachochi' UNION SELECT 'Meoqui'
) t WHERE s.clave='CHIH';

-- Ciudad de México (7)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Álvaro Obregón' m UNION SELECT 'Azcapotzalco' UNION SELECT 'Benito Juárez' UNION
  SELECT 'Coyoacán' UNION SELECT 'Cuajimalpa de Morelos' UNION SELECT 'Cuauhtémoc' UNION
  SELECT 'Gustavo A. Madero' UNION SELECT 'Iztacalco' UNION SELECT 'Iztapalapa' UNION
  SELECT 'La Magdalena Contreras' UNION SELECT 'Miguel Hidalgo' UNION SELECT 'Milpa Alta' UNION
  SELECT 'Tláhuac' UNION SELECT 'Tlalpan' UNION SELECT 'Venustiano Carranza' UNION
  SELECT 'Xochimilco'
) t WHERE s.clave='CDMX';

-- Coahuila (8)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Saltillo' m UNION SELECT 'Torreón' UNION SELECT 'Monclova' UNION
  SELECT 'Piedras Negras' UNION SELECT 'Acuña' UNION SELECT 'Sabinas' UNION
  SELECT 'Ramos Arizpe' UNION SELECT 'San Pedro de las Colonias' UNION SELECT 'Frontera' UNION
  SELECT 'Allende' UNION SELECT 'Arteaga' UNION SELECT 'Castaños' UNION
  SELECT 'Matamoros' UNION SELECT 'Muzquiz' UNION SELECT 'Nadadores' UNION
  SELECT 'Nava' UNION SELECT 'Parras' UNION SELECT 'Zaragoza'
) t WHERE s.clave='COAH';

-- Colima (9)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Armería' m UNION SELECT 'Colima' UNION SELECT 'Comala' UNION
  SELECT 'Coquimatlán' UNION SELECT 'Cuauhtémoc' UNION SELECT 'Ixtlahuacán' UNION
  SELECT 'Manzanillo' UNION SELECT 'Minatitlán' UNION SELECT 'Tecomán' UNION
  SELECT 'Villa de Álvarez'
) t WHERE s.clave='COL';

-- Durango (10)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Durango' m UNION SELECT 'Gómez Palacio' UNION SELECT 'Lerdo' UNION
  SELECT 'Hidalgo' UNION SELECT 'El Salto' UNION SELECT 'Santiago Papasquiaro' UNION
  SELECT 'Canatlán' UNION SELECT 'Pueblo Nuevo' UNION SELECT 'Tamazula' UNION
  SELECT 'Tepehuanes' UNION SELECT 'Vicente Guerrero' UNION SELECT 'Cuencamé' UNION
  SELECT 'Nombre de Dios' UNION SELECT 'Súchil'
) t WHERE s.clave='DGO';

-- Guanajuato (11)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Acámbaro' m UNION SELECT 'Celaya' UNION SELECT 'Comonfort' UNION
  SELECT 'Cortazar' UNION SELECT 'Dolores Hidalgo' UNION SELECT 'Guanajuato' UNION
  SELECT 'Irapuato' UNION SELECT 'Lagos de Moreno' UNION SELECT 'León' UNION
  SELECT 'Manuel Doblado' UNION SELECT 'Moroleón' UNION SELECT 'Pénjamo' UNION
  SELECT 'Purísima del Rincón' UNION SELECT 'Salamanca' UNION SELECT 'Salvatierra' UNION
  SELECT 'San Francisco del Rincón' UNION SELECT 'San Luis de la Paz' UNION
  SELECT 'San Miguel de Allende' UNION SELECT 'Santa Cruz de Juventino Rosas' UNION
  SELECT 'Silao de la Victoria' UNION SELECT 'Uriangato' UNION SELECT 'Valle de Santiago' UNION
  SELECT 'Villagrán' UNION SELECT 'Yuriria'
) t WHERE s.clave='GTO';

-- Guerrero (12)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Acapulco de Juárez' m UNION SELECT 'Chilpancingo de los Bravo' UNION
  SELECT 'Iguala de la Independencia' UNION SELECT 'Zihuatanejo de Azueta' UNION
  SELECT 'Taxco de Alarcón' UNION SELECT 'Chilapa de Álvarez' UNION
  SELECT 'Ciudad Altamirano' UNION SELECT 'Arcelia' UNION SELECT 'Atoyac de Álvarez' UNION
  SELECT 'Ayutla de los Libres' UNION SELECT 'Coyuca de Benítez' UNION
  SELECT 'Huitzuco de los Figueroa' UNION SELECT 'Ometepec' UNION
  SELECT 'Petatlán' UNION SELECT 'Tlapa de Comonfort'
) t WHERE s.clave='GRO';

-- Hidalgo (13)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Pachuca de Soto' m UNION SELECT 'Tulancingo de Bravo' UNION
  SELECT 'Tula de Allende' UNION SELECT 'Actopan' UNION SELECT 'Apan' UNION
  SELECT 'Huejutla de Reyes' UNION SELECT 'Ixmiquilpan' UNION SELECT 'Mixquiahuala de Juárez' UNION
  SELECT 'Tizayuca' UNION SELECT 'Tepeji del Río de Ocampo' UNION
  SELECT 'Atotonilco de Tula' UNION SELECT 'Zimapán' UNION SELECT 'Mineral del Monte'
) t WHERE s.clave='HGO';

-- Jalisco (14)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Guadalajara' m UNION SELECT 'Zapopan' UNION SELECT 'San Pedro Tlaquepaque' UNION
  SELECT 'Tonalá' UNION SELECT 'Tlajomulco de Zúñiga' UNION SELECT 'Puerto Vallarta' UNION
  SELECT 'Lagos de Moreno' UNION SELECT 'Tepatitlán de Morelos' UNION
  SELECT 'La Barca' UNION SELECT 'Ocotlán' UNION SELECT 'San Juan de los Lagos' UNION
  SELECT 'Ameca' UNION SELECT 'Autlán de Navarro' UNION SELECT 'Arandas' UNION
  SELECT 'Ciudad Guzmán' UNION SELECT 'El Salto' UNION SELECT 'Ixtlahuacán de los Membrillos' UNION
  SELECT 'Jamay' UNION SELECT 'Jocotepec' UNION SELECT 'Magdalena' UNION
  SELECT 'Sayula' UNION SELECT 'Tala' UNION SELECT 'Tamazula de Gordiano' UNION
  SELECT 'Tequila' UNION SELECT 'Teuchitlán' UNION SELECT 'Zacoalco de Torres' UNION
  SELECT 'Zapotiltic' UNION SELECT 'Zapotlán el Grande'
) t WHERE s.clave='JAL';

-- Estado de México (15)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Ecatepec de Morelos' m UNION SELECT 'Naucalpan de Juárez' UNION
  SELECT 'Toluca' UNION SELECT 'Tlalnepantla de Baz' UNION SELECT 'Chimalhuacán' UNION
  SELECT 'Nezahualcóyotl' UNION SELECT 'Ixtapaluca' UNION SELECT 'Tultitlán' UNION
  SELECT 'Cuautitlán Izcalli' UNION SELECT 'Atizapán de Zaragoza' UNION
  SELECT 'Coacalco de Berriozábal' UNION SELECT 'Tecámac' UNION
  SELECT 'Metepec' UNION SELECT 'Huixquilucan' UNION SELECT 'Chalco' UNION
  SELECT 'Texcoco' UNION SELECT 'Nicolás Romero' UNION SELECT 'Tultepec' UNION
  SELECT 'Valle de Chalco Solidaridad' UNION SELECT 'La Paz' UNION
  SELECT 'Zinacantepec' UNION SELECT 'Lerma' UNION SELECT 'Tenancingo' UNION
  SELECT 'Tejupilco' UNION SELECT 'Jilotepec' UNION SELECT 'El Oro' UNION
  SELECT 'Tonatico' UNION SELECT 'Amecameca' UNION SELECT 'Zumpango'
) t WHERE s.clave='MEX';

-- Michoacán (16)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Morelia' m UNION SELECT 'Apatzingán' UNION SELECT 'Uruapan' UNION
  SELECT 'Zamora' UNION SELECT 'Lázaro Cárdenas' UNION SELECT 'Zitácuaro' UNION
  SELECT 'Los Reyes' UNION SELECT 'Pátzcuaro' UNION SELECT 'Sahuayo' UNION
  SELECT 'La Piedad' UNION SELECT 'Hidalgo' UNION SELECT 'Puruarán' UNION
  SELECT 'Coalcomán de Vázquez Pallares' UNION SELECT 'Maravatío' UNION
  SELECT 'Jacona' UNION SELECT 'Huetamo' UNION SELECT 'Tacámbaro'
) t WHERE s.clave='MICH';

-- Morelos (17)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Cuernavaca' m UNION SELECT 'Cuautla' UNION SELECT 'Jiutepec' UNION
  SELECT 'Temixco' UNION SELECT 'Xochitepec' UNION SELECT 'Yautepec' UNION
  SELECT 'Ayala' UNION SELECT 'Emiliano Zapata' UNION SELECT 'Jojutla' UNION
  SELECT 'Puente de Ixtla' UNION SELECT 'Zacatepec'
) t WHERE s.clave='MOR';

-- Nayarit (18)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Tepic' m UNION SELECT 'Bahía de Banderas' UNION SELECT 'Compostela' UNION
  SELECT 'Ixtlán del Río' UNION SELECT 'Santiago Ixcuintla' UNION SELECT 'Tecuala' UNION
  SELECT 'Tuxpan' UNION SELECT 'Acaponeta' UNION SELECT 'Ahuacatlán' UNION
  SELECT 'Amatlán de Cañas' UNION SELECT 'Del Nayar' UNION SELECT 'Huajicori'
) t WHERE s.clave='NAY';

-- Nuevo León (19)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Monterrey' m UNION SELECT 'Guadalupe' UNION SELECT 'San Nicolás de los Garza' UNION
  SELECT 'Apodaca' UNION SELECT 'General Escobedo' UNION SELECT 'Santa Catarina' UNION
  SELECT 'San Pedro Garza García' UNION SELECT 'Juárez' UNION SELECT 'García' UNION
  SELECT 'Linares' UNION SELECT 'Montemorelos' UNION SELECT 'Cadereyta Jiménez' UNION
  SELECT 'Allende' UNION SELECT 'Anáhuac' UNION SELECT 'Cerralvo' UNION
  SELECT 'China' UNION SELECT 'Doctor Arroyo' UNION SELECT 'Galeana' UNION
  SELECT 'General Terán' UNION SELECT 'Sabinas Hidalgo' UNION SELECT 'Salinas Victoria'
) t WHERE s.clave='NL';

-- Oaxaca (20)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Oaxaca de Juárez' m UNION SELECT 'San Juan Bautista Tuxtepec' UNION
  SELECT 'Salina Cruz' UNION SELECT 'Juchitán de Zaragoza' UNION SELECT 'Huajuapan de León' UNION
  SELECT 'Puerto Escondido' UNION SELECT 'Miahuatlán de Porfirio Díaz' UNION
  SELECT 'Tlaxiaco' UNION SELECT 'Matías Romero' UNION SELECT 'Pinotepa Nacional' UNION
  SELECT 'Tehuantepec' UNION SELECT 'Loma Bonita' UNION SELECT 'Ocotlán de Morelos'
) t WHERE s.clave='OAX';

-- Puebla (21)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Puebla' m UNION SELECT 'Tehuacán' UNION SELECT 'San Martín Texmelucan' UNION
  SELECT 'Atlixco' UNION SELECT 'Izúcar de Matamoros' UNION SELECT 'Cholula' UNION
  SELECT 'San Pedro Cholula' UNION SELECT 'San Andrés Cholula' UNION
  SELECT 'Chignahuapan' UNION SELECT 'Teziutlán' UNION SELECT 'Huauchinango' UNION
  SELECT 'Zacatlán' UNION SELECT 'Amozoc' UNION SELECT 'Ajalpan' UNION
  SELECT 'Ciudad Serdán' UNION SELECT 'Huejotzingo' UNION SELECT 'Libres'
) t WHERE s.clave='PUE';

-- Querétaro (22)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Querétaro' m UNION SELECT 'San Juan del Río' UNION SELECT 'El Marqués' UNION
  SELECT 'Corregidora' UNION SELECT 'Huimilpan' UNION SELECT 'Amealco de Bonfil' UNION
  SELECT 'Tequisquiapan' UNION SELECT 'Cadereyta de Montes' UNION SELECT 'Colón' UNION
  SELECT 'Ezequiel Montes' UNION SELECT 'Jalpan de Serra' UNION SELECT 'Landa de Matamoros' UNION
  SELECT 'Pedro Escobedo' UNION SELECT 'Peñamiller' UNION SELECT 'San Joaquín' UNION
  SELECT 'Tolimán' UNION SELECT 'Villa del Pueblito' UNION SELECT 'Arroyo Seco'
) t WHERE s.clave='QRO';

-- Quintana Roo (23)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Cancún' m UNION SELECT 'Playa del Carmen' UNION SELECT 'Chetumal' UNION
  SELECT 'Cozumel' UNION SELECT 'Tulum' UNION SELECT 'Felipe Carrillo Puerto' UNION
  SELECT 'Isla Mujeres' UNION SELECT 'Bacalar' UNION SELECT 'Benito Juárez' UNION
  SELECT 'Puerto Morelos' UNION SELECT 'Solidaridad' UNION SELECT 'José María Morelos'
) t WHERE s.clave='QROO';

-- San Luis Potosí (24)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'San Luis Potosí' m UNION SELECT 'Soledad de Graciano Sánchez' UNION
  SELECT 'Ciudad Valles' UNION SELECT 'Matehuala' UNION SELECT 'Tamazunchale' UNION
  SELECT 'Rioverde' UNION SELECT 'Ébano' UNION SELECT 'Tamuín' UNION
  SELECT 'Cárdenas' UNION SELECT 'Charcas' UNION SELECT 'Cerritos' UNION
  SELECT 'Xilitla' UNION SELECT 'Tancanhuitz'
) t WHERE s.clave='SLP';

-- Sinaloa (25)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Culiacán' m UNION SELECT 'Mazatlán' UNION SELECT 'Los Mochis' UNION
  SELECT 'Guasave' UNION SELECT 'Guamúchil' UNION SELECT 'Navolato' UNION
  SELECT 'El Rosario' UNION SELECT 'Escuinapa' UNION SELECT 'Mocorito' UNION
  SELECT 'Angostura' UNION SELECT 'Cosalá' UNION SELECT 'Choix' UNION
  SELECT 'El Fuerte' UNION SELECT 'Badiraguato' UNION SELECT 'San Ignacio'
) t WHERE s.clave='SIN';

-- Sonora (26)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Hermosillo' m UNION SELECT 'Ciudad Obregón' UNION SELECT 'Nogales' UNION
  SELECT 'San Luis Río Colorado' UNION SELECT 'Navojoa' UNION SELECT 'Guaymas' UNION
  SELECT 'Agua Prieta' UNION SELECT 'Caborca' UNION SELECT 'Cananea' UNION
  SELECT 'Huatabampo' UNION SELECT 'Magdalena de Kino' UNION SELECT 'Puerto Peñasco' UNION
  SELECT 'Ures' UNION SELECT 'Álamos' UNION SELECT 'Benito Juárez' UNION
  SELECT 'Cajeme' UNION SELECT 'Empalme'
) t WHERE s.clave='SON';

-- Tabasco (27)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Villahermosa' m UNION SELECT 'Cárdenas' UNION SELECT 'Comalcalco' UNION
  SELECT 'Cunduacán' UNION SELECT 'Huimanguillo' UNION SELECT 'Macuspana' UNION
  SELECT 'Paraíso' UNION SELECT 'Tenosique' UNION SELECT 'Balancán' UNION
  SELECT 'Centro' UNION SELECT 'Emiliano Zapata' UNION SELECT 'Jalpa de Méndez' UNION
  SELECT 'Jonuta' UNION SELECT 'Nacajuca' UNION SELECT 'Tacotalpa' UNION
  SELECT 'Teapa'
) t WHERE s.clave='TAB';

-- Tamaulipas (28)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Reynosa' m UNION SELECT 'Matamoros' UNION SELECT 'Nuevo Laredo' UNION
  SELECT 'Tampico' UNION SELECT 'Ciudad Victoria' UNION SELECT 'Altamira' UNION
  SELECT 'Madero' UNION SELECT 'Laredo' UNION SELECT 'Miguel Alemán' UNION
  SELECT 'Río Bravo' UNION SELECT 'Mante' UNION SELECT 'Tula' UNION
  SELECT 'San Fernando' UNION SELECT 'Camargo' UNION SELECT 'Guerrero' UNION
  SELECT 'Padilla' UNION SELECT 'Soto la Marina'
) t WHERE s.clave='TAMS';

-- Tlaxcala (29)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Tlaxcala' m UNION SELECT 'Apizaco' UNION SELECT 'Chiautempan' UNION
  SELECT 'Calpulalpan' UNION SELECT 'Huamantla' UNION SELECT 'Tlaxco' UNION
  SELECT 'Zacatelco' UNION SELECT 'Santa Ana Nopalucan' UNION
  SELECT 'Papalotla de Xicohténcatl' UNION SELECT 'Ixtacuixtla de Mariano Matamoros'
) t WHERE s.clave='TLAX';

-- Veracruz (30)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Veracruz' m UNION SELECT 'Xalapa' UNION SELECT 'Coatzacoalcos' UNION
  SELECT 'Córdoba' UNION SELECT 'Orizaba' UNION SELECT 'Tuxpan' UNION
  SELECT 'Poza Rica de Hidalgo' UNION SELECT 'Minatitlán' UNION SELECT 'Boca del Río' UNION
  SELECT 'Papantla' UNION SELECT 'San Andrés Tuxtla' UNION SELECT 'Acayucan' UNION
  SELECT 'Cosamaloapan de Carpio' UNION SELECT 'Tierra Blanca' UNION
  SELECT 'Coatepec' UNION SELECT 'Nogales' UNION SELECT 'Perote' UNION
  SELECT 'Las Choapas' UNION SELECT 'Tantoyuca' UNION SELECT 'Naranjos Amatlán'
) t WHERE s.clave='VER';

-- Yucatán (31)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Mérida' m UNION SELECT 'Valladolid' UNION SELECT 'Tizimín' UNION
  SELECT 'Progreso' UNION SELECT 'Motul' UNION SELECT 'Hunucmá' UNION
  SELECT 'Ticul' UNION SELECT 'Tekax' UNION SELECT 'Acanceh' UNION
  SELECT 'Izamal' UNION SELECT 'Maxcanú' UNION SELECT 'Peto' UNION
  SELECT 'Oxkutzcab' UNION SELECT 'Umán'
) t WHERE s.clave='YUC';

-- Zacatecas (32)
INSERT INTO municipios (estado_id, nombre) SELECT id, m FROM estados s JOIN (
  SELECT 'Zacatecas' m UNION SELECT 'Guadalupe' UNION SELECT 'Fresnillo' UNION
  SELECT 'Jerez de García Salinas' UNION SELECT 'Loreto' UNION SELECT 'Calera' UNION
  SELECT 'Pinos' UNION SELECT 'Sombrerete' UNION SELECT 'Villanueva' UNION
  SELECT 'Ojocaliente' UNION SELECT 'Juchipila' UNION SELECT 'Tlaltenango de Sánchez Román' UNION
  SELECT 'Juan Aldama' UNION SELECT 'Nieves' UNION SELECT 'Río Grande'
) t WHERE s.clave='ZAC';


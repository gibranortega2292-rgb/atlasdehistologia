const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('railway.internal')
    ? { rejectUnauthorized: false }
    : false
});

const TIPOS = ['Epitelial', 'Conectivo', 'Muscular', 'Nervioso'];
const AUMENTOS = [4, 10, 40, 100]; // aumento del objetivo del microscopio

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Revisar los datos que llegan del formulario
function validar(body) {
  const tejido = {
    nombre: (body.nombre || '').trim(),
    tipo: (body.tipo || '').trim(),
    localizacion: (body.localizacion || '').trim(),
    tincion: (body.tincion || '').trim(),
    aumento: Number(body.aumento),
    descripcion: (body.descripcion || '').trim(),
    imagen_url: (body.imagen_url || '').trim()
  };

  if (!tejido.nombre || !tejido.localizacion || !tejido.tincion || !tejido.descripcion) {
    return { error: 'Completa nombre, localización, tinción y descripción' };
  }
  if (!TIPOS.includes(tejido.tipo)) {
    return { error: 'Elige un tipo de tejido válido' };
  }
  if (!AUMENTOS.includes(tejido.aumento)) {
    return { error: 'Elige un aumento válido (4x, 10x, 40x o 100x)' };
  }
  // Se acepta un enlace externo o una imagen guardada en public/img
  if (tejido.imagen_url && !/^(https:\/\/|\/img\/)/.test(tejido.imagen_url)) {
    return { error: 'El enlace de la imagen debe empezar con https://' };
  }

  return { tejido };
}

// Crear la tabla y cargar ejemplos si está vacía
async function iniciar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tejidos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      tipo VARCHAR(20) NOT NULL,
      localizacion VARCHAR(150) NOT NULL,
      tincion VARCHAR(80) NOT NULL,
      aumento INTEGER NOT NULL DEFAULT 40,
      descripcion TEXT NOT NULL,
      imagen_url TEXT,
      creado TIMESTAMP DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*) AS total FROM tejidos');
  if (Number(rows[0].total) === 0) {
    const ejemplos = [
      ['Tejido adiposo blanco', 'Conectivo', 'Hipodermis y mesenterio', 'Hematoxilina y eosina (H&E)', 10,
        'Adipocitos grandes con una sola gota de lípido que se disuelve al procesar la muestra. El citoplasma y el núcleo quedan aplanados en la periferia, con aspecto de anillo de sello.'],
      ['Epitelio cilíndrico simple', 'Epitelial', 'Intestino delgado', 'Hematoxilina y eosina (H&E)', 40,
        'Células altas con núcleos alineados en la base y microvellosidades en la superficie. Entre ellas aparecen células caliciformes productoras de moco.'],
      ['Epitelio plano estratificado no queratinizado', 'Epitelial', 'Esófago y exocérvix', 'Hematoxilina y eosina (H&E)', 10,
        'Varias capas de células: las basales son cúbicas y las superficiales se aplanan y conservan su núcleo. Es la base de la citología cervical.'],
      ['Cartílago hialino', 'Conectivo', 'Tráquea y superficies articulares', 'Tricrómico', 10,
        'Condrocitos dentro de lagunas, a menudo en grupos isógenos, rodeados de una matriz basófila y homogénea sin vasos sanguíneos.'],
      ['Hueso compacto', 'Conectivo', 'Diáfisis de huesos largos', 'Técnica de desgaste', 10,
        'Osteonas formadas por laminillas concéntricas alrededor de un conducto de Havers, con osteocitos en lagunas unidas por canalículos.'],
      ['Sangre periférica', 'Conectivo', 'Frotis de sangre venosa', 'Wright', 100,
        'Eritrocitos sin núcleo con palidez central, neutrófilos de núcleo segmentado, linfocitos de núcleo redondo y plaquetas pequeñas.'],
      ['Músculo estriado esquelético', 'Muscular', 'Lengua y músculos esqueléticos', 'Hematoxilina y eosina (H&E)', 40,
        'Fibras largas y multinucleadas con núcleos en la periferia y estriaciones transversales visibles en corte longitudinal.'],
      ['Músculo cardíaco', 'Muscular', 'Miocardio', 'Hematoxilina y eosina (H&E)', 40,
        'Fibras ramificadas con uno o dos núcleos centrales, unidas por discos intercalares que se ven como líneas transversales oscuras.'],
      ['Neuronas motoras', 'Nervioso', 'Asta anterior de la médula espinal', 'Nissl (violeta de cresilo)', 40,
        'Cuerpos neuronales grandes con núcleo claro, nucléolo evidente y grumos de Nissl (retículo endoplásmico rugoso) en el citoplasma.']
    ];

    // Fotos de microscopio guardadas en public/img
    const imagenes = {
      'Tejido adiposo blanco': '/img/tejido-adiposo.jpg',
      'Epitelio cilíndrico simple': '/img/epitelio-cilindrico-simple.jpg',
      'Epitelio plano estratificado no queratinizado': '/img/epitelio-plano-estratificado.jpg',
      'Cartílago hialino': '/img/cartilago-hialino.jpg',
      'Hueso compacto': '/img/hueso-compacto.jpg',
      'Sangre periférica': '/img/sangre-periferica.jpg',
      'Músculo estriado esquelético': '/img/musculo-esqueletico.jpg',
      'Músculo cardíaco': '/img/musculo-cardiaco.jpg',
      'Neuronas motoras': '/img/neuronas-motoras.jpg'
    };

    for (const t of ejemplos) {
      await pool.query(
        `INSERT INTO tejidos (nombre, tipo, localizacion, tincion, aumento, descripcion, imagen_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [...t, imagenes[t[0]] || null]
      );
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atlas histológico activo en el puerto ${PORT}`);
  });
}

// CONSULTAR todos (con filtro opcional por tipo y búsqueda)
app.get('/api/tejidos', async (req, res) => {
  const tipo = TIPOS.includes(req.query.tipo) ? req.query.tipo : null;
  const buscar = (req.query.buscar || '').trim();

  try {
    const resultado = await pool.query(
      `SELECT * FROM tejidos
       WHERE ($1::text IS NULL OR tipo = $1)
         AND ($2 = '' OR nombre ILIKE '%' || $2 || '%' OR localizacion ILIKE '%' || $2 || '%')
       ORDER BY id`,
      [tipo, buscar]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudieron consultar los tejidos' });
  }
});

// CONSULTAR uno
app.get('/api/tejidos/:id', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT * FROM tejidos WHERE id = $1', [req.params.id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tejido no encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo consultar el tejido' });
  }
});

// AGREGAR
app.post('/api/tejidos', async (req, res) => {
  const { tejido, error } = validar(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const resultado = await pool.query(
      `INSERT INTO tejidos (nombre, tipo, localizacion, tincion, aumento, descripcion, imagen_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tejido.nombre, tejido.tipo, tejido.localizacion, tejido.tincion, tejido.aumento,
        tejido.descripcion, tejido.imagen_url || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar el tejido' });
  }
});

// EDITAR
app.put('/api/tejidos/:id', async (req, res) => {
  const { tejido, error } = validar(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const resultado = await pool.query(
      `UPDATE tejidos
       SET nombre = $1, tipo = $2, localizacion = $3, tincion = $4, aumento = $5,
           descripcion = $6, imagen_url = $7
       WHERE id = $8 RETURNING *`,
      [tejido.nombre, tejido.tipo, tejido.localizacion, tejido.tincion, tejido.aumento,
        tejido.descripcion, tejido.imagen_url || null, req.params.id]
    );
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tejido no encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo editar el tejido' });
  }
});

// ELIMINAR
app.delete('/api/tejidos/:id', async (req, res) => {
  try {
    const resultado = await pool.query('DELETE FROM tejidos WHERE id = $1 RETURNING *', [req.params.id]);
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tejido no encontrado' });
    }
    res.json({ mensaje: 'Tejido eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo eliminar el tejido' });
  }
});

iniciar().catch(error => {
  console.error('Error al iniciar la aplicación:', error);
  process.exit(1);
});

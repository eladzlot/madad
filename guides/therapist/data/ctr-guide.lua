-- ctr-guide.lua — the therapist guide's Markdown -> the CTR document class.
--
-- Runs before ctr-templates' own ctr-meta.lua, so the guide can stay plain
-- Markdown that also reads well on its own:
--   > note          -> ::: ctrcallout  (the class makes > a pull quote)
--   images          -> sized by what they show, inline (no floats, no captions)
-- Build: see build-pdf.sh beside this file.

local function size(src)
  if src:match('00%-composer%-qr') then return { width = '3.2cm' } end
  if src:match('%-pair%.png$') or src:match('%-row%.png$') then return { width = '100%' } end
  if src:match('00%-quickstart')    then return { width = '100%' } end
  if src:match('%-phone%.png$')     then return { height = '8.5cm' } end
  if src:match('/12%-email')         then return { width = '75%' } end
  if src:match('/1[4-7]%-')          then return { width = '85%' } end
  return { width = '100%' }
end

function Image(img)
  for k, v in pairs(size(img.src)) do img.attributes[k] = v end
  img.caption = {}   -- the headings already say what each picture is
  return img
end

-- An image alone in a paragraph (a Figure, to pandoc) is centred in place:
-- a float would drift away from the step it illustrates.
function Figure(f)
  local out = pandoc.List({ pandoc.RawBlock('latex', '\\begin{center}') })
  out:extend(f.content)
  out:insert(pandoc.RawBlock('latex', '\\end{center}'))
  return out
end

-- Frank Ruhl has no ↑ ↓ ↗ and the class only borrows → ← ↔ from the sans;
-- borrow these the same way.
-- (Lua patterns are bytewise, so each arrow is matched as a whole string.)
function Str(s)
  local t, n = s.text, 0
  for _, a in ipairs({ '↑', '↓', '↗' }) do
    local k
    t, k = t:gsub(a, '{\\sffamily ' .. a .. '}')
    n = n + k
  end
  if n > 0 then return pandoc.RawInline('latex', t) end
end

function BlockQuote(q)
  return pandoc.Div(q.content, pandoc.Attr('', { 'ctrcallout' }))
end

-- The Markdown's own H1 is the title; the class sets the title from metadata.
function Pandoc(doc)
  if doc.blocks[1] and doc.blocks[1].t == 'Header' and doc.blocks[1].level == 1 then
    doc.blocks:remove(1)
  end
  -- Pandoc emits width + height=\textheight and leaves keepaspectratio to its
  -- default template, which ctr.latex does not include.
  local hi = doc.meta['header-includes'] or pandoc.MetaList({})
  if hi.t ~= 'MetaList' and type(hi) ~= 'table' then hi = pandoc.MetaList({ hi }) end
  table.insert(hi, pandoc.MetaBlocks({ pandoc.RawBlock('latex', '\\setkeys{Gin}{keepaspectratio}') }))
  doc.meta['header-includes'] = hi
  return doc
end

-- `## Heading {.newpage}` starts a new page.
function Header(h)
  if h.classes:includes('newpage') then
    return { pandoc.RawBlock('latex', '\\newpage'), h }
  end
end

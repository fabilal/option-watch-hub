-- Table pour stocker les symboles scrapés
CREATE TABLE public.scraped_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  latest TEXT DEFAULT '',
  change TEXT DEFAULT '',
  volume TEXT DEFAULT '',
  source TEXT DEFAULT 'barchart',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(category, symbol, source)
);

-- Table pour stocker les maturités scrapées
CREATE TABLE public.scraped_maturities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  expiration TEXT DEFAULT '',
  source TEXT DEFAULT 'barchart',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, code, source)
);

-- Table pour stocker les strikes scrapés
CREATE TABLE public.scraped_strikes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strike NUMERIC NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(exchange, symbol, strike)
);

-- Table pour stocker les futures scrapés
CREATE TABLE public.scraped_futures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  contract TEXT NOT NULL,
  month TEXT DEFAULT '',
  last TEXT DEFAULT '',
  change TEXT DEFAULT '',
  percent_change TEXT DEFAULT '',
  open TEXT DEFAULT '',
  high TEXT DEFAULT '',
  low TEXT DEFAULT '',
  volume TEXT DEFAULT '',
  open_interest TEXT DEFAULT '',
  time TEXT DEFAULT '',
  source TEXT DEFAULT 'barchart',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, contract, source)
);

-- Table pour stocker les options scrapées
CREATE TABLE public.scraped_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  maturity TEXT NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('call', 'put')),
  strike TEXT NOT NULL,
  last TEXT DEFAULT '',
  change TEXT DEFAULT '',
  bid TEXT DEFAULT '',
  ask TEXT DEFAULT '',
  volume TEXT DEFAULT '',
  open_interest TEXT DEFAULT '',
  iv TEXT DEFAULT '',
  delta TEXT DEFAULT '',
  gamma TEXT DEFAULT '',
  theta TEXT DEFAULT '',
  vega TEXT DEFAULT '',
  source TEXT DEFAULT 'barchart',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, maturity, option_type, strike, source)
);

-- Index pour optimiser les requêtes
CREATE INDEX idx_scraped_symbols_category ON public.scraped_symbols(category, source);
CREATE INDEX idx_scraped_symbols_expires ON public.scraped_symbols(expires_at);
CREATE INDEX idx_scraped_maturities_symbol ON public.scraped_maturities(symbol, source);
CREATE INDEX idx_scraped_maturities_expires ON public.scraped_maturities(expires_at);
CREATE INDEX idx_scraped_strikes_lookup ON public.scraped_strikes(exchange, symbol);
CREATE INDEX idx_scraped_strikes_expires ON public.scraped_strikes(expires_at);
CREATE INDEX idx_scraped_futures_symbol ON public.scraped_futures(symbol, source);
CREATE INDEX idx_scraped_futures_expires ON public.scraped_futures(expires_at);
CREATE INDEX idx_scraped_options_lookup ON public.scraped_options(symbol, maturity, source);
CREATE INDEX idx_scraped_options_expires ON public.scraped_options(expires_at);

-- Désactiver RLS pour les tables (accès via service role key uniquement)
ALTER TABLE public.scraped_symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_maturities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_strikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_futures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_options ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre lecture publique (anon key)
CREATE POLICY "Allow public read access to scraped_symbols" ON public.scraped_symbols FOR SELECT USING (true);
CREATE POLICY "Allow public read access to scraped_maturities" ON public.scraped_maturities FOR SELECT USING (true);
CREATE POLICY "Allow public read access to scraped_strikes" ON public.scraped_strikes FOR SELECT USING (true);
CREATE POLICY "Allow public read access to scraped_futures" ON public.scraped_futures FOR SELECT USING (true);
CREATE POLICY "Allow public read access to scraped_options" ON public.scraped_options FOR SELECT USING (true);

-- Politique pour permettre écriture via service role (edge functions)
CREATE POLICY "Allow service role write to scraped_symbols" ON public.scraped_symbols FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role write to scraped_maturities" ON public.scraped_maturities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role write to scraped_strikes" ON public.scraped_strikes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role write to scraped_futures" ON public.scraped_futures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow service role write to scraped_options" ON public.scraped_options FOR ALL USING (true) WITH CHECK (true);

-- Fonction pour nettoyer les données expirées
CREATE OR REPLACE FUNCTION public.cleanup_expired_scraped_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM scraped_symbols WHERE expires_at < now();
  DELETE FROM scraped_maturities WHERE expires_at < now();
  DELETE FROM scraped_strikes WHERE expires_at < now();
  DELETE FROM scraped_futures WHERE expires_at < now();
  DELETE FROM scraped_options WHERE expires_at < now();
END;
$$;

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_scraped_symbols_updated_at
BEFORE UPDATE ON public.scraped_symbols
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scraped_maturities_updated_at
BEFORE UPDATE ON public.scraped_maturities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
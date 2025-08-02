require 'httparty'

class WhatsOnChain
  include HTTParty
  base_uri 'https://api.whatsonchain.com'
  default_timeout 5
  headers 'Accept' => 'application/json'
  format :json

  $CHAIN = 'bsv' # btc
  $NETWORK = 'main' # test

  def info(params = {})
    self.class.get("/v1/#{$CHAIN}/#{$NETWORK}/chain/info")
  end

  def get_address_info(address)
    self.class.get("/v1/#{$CHAIN}/#{$NETWORK}/address/#{address}/info")
  end

  def get_address_balance(address)
    self.class.get("/v1/#{$CHAIN}/#{$NETWORK}/address/#{address}/unspent/all")
  end
end

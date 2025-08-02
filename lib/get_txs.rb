require_relative 'whats_on_chain.rb'

# Get the Address balance from Whats on Chain
w = WhatsOnChain.new
response = w.get_address_balance("13ycKt5iTceSbmZ1GGJgvKsoGaJPv2pVgZ")

# Loop the results and save to /_data/txs.json
txs = response["result"]
txs = txs.filter { |tx| tx["status"] == "confirmed" }
txs = txs.sort_by { |tx| tx["height"] }

File.open("_data/txs.json", "w") do |f|
  f << JSON.pretty_generate(txs)
end
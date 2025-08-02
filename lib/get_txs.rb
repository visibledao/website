require_relative 'whats_on_chain.rb'

# Get the Address balance from Whats on Chain
w = WhatsOnChain.new
response = w.get_address_balance("13ycKt5iTceSbmZ1GGJgvKsoGaJPv2pVgZ")

# Loop the results and save to /_data/txs.json
txs = response["result"]
txs = txs.filter { |tx| tx["status"] == "confirmed" }
txs = txs.sort_by { |tx| tx["height"] }

## Loop each TX and get its full contents
# txs.each do |tx|
#   response = w.get_tx(tx["tx_hash"])
#   hash = JSON.parse(response.to_s)

#   puts "Saving #{tx["tx_hash"]} ..."
#   File.open("_data/txs/#{tx["tx_hash"]}.json", "w") do |f|
#     f << JSON.pretty_generate(hash)
#   end
#   sleep 1.618
# end

puts "Saving _data/txs/index.json ..."
File.open("_data/txs/index.json", "w") do |f|
  f << JSON.pretty_generate(txs)
end
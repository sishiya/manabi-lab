#!/usr/bin/perl
# 1ファイル完結の index.html を、CSS と役割ごとの JS に分ける（中身は変えず、並び順もそのまま）。
# Artifact で公開していたころの1ファイルのアプリを、ほかのアプリと同じ css/ js/ の形にするための道具（2026-10-12）。
#
# 使い方（アプリのフォルダで。先に versions/ へバックアップすること）:
#   perl ../_dev/tools/split-single.pl index.html <styleの行> <scriptの行> <IIFE> 名前:開始行 名前:開始行 ...
#   <styleの行>  = "<style>" の行番号（"</style>" までを css/style.css へ）
#   <scriptの行> = 本体の "<script>" の行番号（"</script>" までを js/ へ）
#   <IIFE>       = 1 なら、本体を包む "(function(){" "'use strict';" と最後の "})();" を外す（ファイルをまたいで名前を共有するため）
#   名前:開始行  = js/<名前>.js に入れる最初の行（元のファイルの行番号）。次の名前の開始行の手前まで。最初のものは本体の最初から。
# できるもの: css/style.css、js/<名前>.js（先頭に 'use strict'）、書きかえた index.html（<link> と <script src> に置きかえ）。
use strict; use warnings; use utf8;
binmode STDOUT, ':utf8';
my ($file, $styleL, $scriptL, $iife, @parts) = @ARGV;
open my $fh, '<:raw', $file or die "$file: $!";
my @L = <$fh>; close $fh;
my $n = @L;
my $line = sub { my $i = shift; $L[$i - 1] };
# </style> と </script> の行をさがす
my ($styleE) = grep { $line->($_) =~ m{^</style>} } ($styleL + 1 .. $n);
die "</style> が見つからない" unless $styleE && $line->($styleL) =~ /^<style>\s*$/;
die "$scriptL 行目が <script> ではない" unless $line->($scriptL) =~ /^<script>\s*$/;
my ($scriptE) = grep { $line->($_) =~ m{^</script>} } ($scriptL + 1 .. $n);
die "</script> が見つからない" unless $scriptE;
my ($b0, $b1) = ($scriptL + 1, $scriptE - 1);   # 本体の行
if ($iife) {
  die "本体の最初が (function(){ か (()=>{ ではない" unless $line->($b0) =~ /^\((function\(\)|\(\)=>)\{\s*$/;
  die "2行目が 'use strict'; ではない" unless $line->($b0 + 1) =~ /^'use strict';\s*$/;
  die "本体の最後が })(); ではない" unless $line->($b1) =~ /^\}\)\(\);\s*$/;
  ($b0, $b1) = ($b0 + 2, $b1 - 1);
}
my @starts = map { my ($nm, $s) = split /:/; [$nm, $s] } @parts;
$starts[0][1] = $b0;
for my $k (1 .. $#starts) { die "開始行の順がおかしい: $starts[$k][0]" unless $starts[$k][1] > $starts[$k - 1][1] && $starts[$k][1] <= $b1; }
mkdir 'css'; mkdir 'js';
sub out { my ($p, @x) = @_; open my $o, '>:raw', $p or die "$p: $!"; print $o @x; close $o; }
out('css/style.css', @L[$styleL .. $styleE - 2]);
my @tags;
for my $k (0 .. $#starts) {
  my ($nm, $s) = @{$starts[$k]};
  my $e = $k < $#starts ? $starts[$k + 1][1] - 1 : $b1;
  out("js/$nm.js", "'use strict';\n", @L[$s - 1 .. $e - 1]);
  push @tags, "<script src=\"js/$nm.js\"></script>\n";
  printf "js/%-10s %5d〜%5d 行（%d 行）\n", "$nm.js", $s, $e, $e - $s + 1;
}
my @new = (@L[0 .. $styleL - 2], "<link rel=\"stylesheet\" href=\"css/style.css\">\n", @L[$styleE .. $scriptL - 2], @tags, @L[$scriptE .. $n - 1]);
out($file, @new);
printf "css/style.css %d 行。%s は %d 行 → %d 行\n", $styleE - $styleL - 1, $file, $n, scalar @new;
